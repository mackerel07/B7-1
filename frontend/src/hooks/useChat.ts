import { useRef, useState } from "react";
import type { ChatMessage } from "../components/chat/MessageList";
import { useAuth } from "../contexts/AuthContext";
import { ApiError, isRetryableError, postChat } from "../lib/api";

const STORAGE_PREFIX = "b7-1:chat:conversation:";

type StoredConversation = {
  conversationId: string;
  messages: ChatMessage[];
};

/** 사용자마다 키를 나눈다. 같은 탭에서 계정을 바꿔도 남의 대화를 물려받지 않는다. */
function storageKeyFor(userId: string | undefined): string | null {
  return userId ? `${STORAGE_PREFIX}${userId}` : null;
}

/** 프라이빗 모드 등에서 접근이 막히거나 값이 손상됐을 수 있다. 그때는 새 대화로 시작한다. */
function readStored(key: string | null): StoredConversation | null {
  if (!key) {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredConversation;
    if (typeof parsed?.conversationId !== "string" || !Array.isArray(parsed?.messages)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(key: string | null, value: StoredConversation | null): void {
  if (!key) {
    return;
  }
  try {
    if (value) {
      sessionStorage.setItem(key, JSON.stringify(value));
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // 저장하지 못해도 이번 화면의 대화는 계속 이어갈 수 있다
  }
}

export type UseChat = {
  messages: ChatMessage[];
  pending: boolean;
  error: unknown;
  /** 대화가 시작됐는지. 「새 채팅」 노출 여부를 정한다. */
  hasConversation: boolean;
  /** 재시도가 의미 있을 때만 함수를 준다. 없으면 null. */
  retry: (() => void) | null;
  send: (question: string) => Promise<void>;
  startNewConversation: () => void;
};

/**
 * 채팅 화면의 상태와 전송 흐름을 담는다. 화면은 이 훅이 준 값을 그리기만 한다.
 *
 * 대화는 sessionStorage에 보관해 새로고침이나 화면 이동을 견딘다. 다만 저장 대상은
 * 화면의 messages가 아니라 서버가 성공으로 응답한 것만 모은 목록이다. 실패한 질문은
 * 낙관적으로 화면에 남지만 서버에는 기록되지 않으므로, 저장하면 새로고침한 화면이
 * 실제 기록과 어긋난다.
 */
export function useChat(): UseChat {
  const { user, accessToken } = useAuth();
  const storageKey = storageKeyFor(user?.id);

  const [restored] = useState(() => readStored(storageKey));
  const [messages, setMessages] = useState<ChatMessage[]>(restored?.messages ?? []);
  const [conversationId, setConversationId] = useState<string | null>(
    restored?.conversationId ?? null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const confirmedRef = useRef<ChatMessage[]>(restored?.messages ?? []);

  function startNewConversation() {
    confirmedRef.current = [];
    writeStored(storageKey, null);
    setConversationId(null);
    setMessages([]);
    setError(null);
    setLastQuestion(null);
  }

  async function sendQuestion(question: string, options?: { isRetry?: boolean }) {
    if (!accessToken || pending) {
      return;
    }

    setError(null);
    setLastQuestion(question);
    setPending(true);
    if (!options?.isRetry) {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-user-${crypto.randomUUID()}`,
          role: "user",
          content: question,
        },
      ]);
    }

    try {
      const result = await postChat({
        accessToken,
        question,
        conversationId,
      });

      const answer: ChatMessage = {
        id: result.id,
        role: "assistant",
        content: result.answer,
        createdAt: result.created_at,
      };

      setConversationId(result.conversation_id);
      setMessages((prev) => [...prev, answer]);
      setLastQuestion(null);

      confirmedRef.current = [
        ...confirmedRef.current,
        { id: `${result.id}-question`, role: "user", content: question },
        answer,
      ];
      writeStored(storageKey, {
        conversationId: result.conversation_id,
        messages: confirmedRef.current,
      });
    } catch (err) {
      // 401이면 lib/api.ts가 세션을 정리하고 ProtectedRoute가 로그인 화면으로
      // 보낸다. 여기서는 곧 사라질 배너를 띄우지 않기만 하면 된다.
      if (err instanceof ApiError && err.status === 401) {
        return;
      }
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return {
    messages,
    pending,
    error,
    hasConversation: messages.length > 0 || conversationId !== null,
    retry:
      lastQuestion && isRetryableError(error)
        ? () => {
            void sendQuestion(lastQuestion, { isRetry: true });
          }
        : null,
    send: (question: string) => sendQuestion(question),
    startNewConversation,
  };
}

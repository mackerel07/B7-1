import { useEffect, useRef, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ChatInput } from "../components/chat/ChatInput";
import { ErrorBanner } from "../components/chat/ErrorBanner";
import { MessageList, type ChatMessage } from "../components/chat/MessageList";
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

export default function ChatPage() {
  const { user, accessToken, signOut } = useAuth();
  const storageKey = storageKeyFor(user?.id);

  const [restored] = useState(() => readStored(storageKey));
  const [messages, setMessages] = useState<ChatMessage[]>(restored?.messages ?? []);
  const [conversationId, setConversationId] = useState<string | null>(
    restored?.conversationId ?? null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /**
   * 저장 대상은 화면의 messages가 아니라 서버가 성공으로 응답한 것만 모은 목록이다.
   * 실패한 질문은 낙관적으로 화면에 남지만 서버에는 기록되지 않았으므로 저장하지 않는다.
   * 그래야 새로고침한 화면이 실제 기록과 어긋나지 않는다.
   */
  const confirmedRef = useRef<ChatMessage[]>(restored?.messages ?? []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

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

  const hasConversation = messages.length > 0 || conversationId !== null;

  return (
    <AppShell email={user?.email} onLogout={() => void signOut()}>
      <main className="page chat-page">
        <div className="chat-page__header">
          <p className="eyebrow">Context</p>
          <h1>대화</h1>
          <p className="lede">질문과 AI 응답이 같은 화면에 이어집니다.</p>
          {hasConversation ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={startNewConversation}
              disabled={pending}
            >
              새 채팅
            </button>
          ) : null}
        </div>

        <section className="chat-page__stage panel" aria-label="대화 내용">
          <MessageList messages={messages} pending={pending} />
          <div ref={bottomRef} />
        </section>

        {error ? (
          <ErrorBanner
            error={error}
            onRetry={
              lastQuestion && isRetryableError(error)
                ? () => {
                    void sendQuestion(lastQuestion, { isRetry: true });
                  }
                : undefined
            }
          />
        ) : null}

        <ChatInput disabled={!accessToken} pending={pending} onSubmit={sendQuestion} />
      </main>
    </AppShell>
  );
}

import { useEffect, useRef, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ChatInput } from "../components/chat/ChatInput";
import { ErrorBanner } from "../components/chat/ErrorBanner";
import { MessageList, type ChatMessage } from "../components/chat/MessageList";
import { useAuth } from "../contexts/AuthContext";
import { postChat } from "../lib/api";

export default function ChatPage() {
  const { user, accessToken, signOut } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

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
      setConversationId(result.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: result.id,
          role: "assistant",
          content: result.answer,
          createdAt: result.created_at,
        },
      ]);
      setLastQuestion(null);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell email={user?.email} onLogout={() => void signOut()}>
      <main className="page chat-page">
        <div className="chat-page__header">
          <p className="eyebrow">Context</p>
          <h1>대화</h1>
          <p className="lede">질문과 AI 응답이 같은 화면에 이어집니다.</p>
        </div>

        <section className="chat-page__stage panel" aria-label="대화 내용">
          <MessageList messages={messages} pending={pending} />
          <div ref={bottomRef} />
        </section>

        {error ? (
          <ErrorBanner
            error={error}
            onRetry={
              lastQuestion
                ? () => {
                    void sendQuestion(lastQuestion, { isRetry: true });
                  }
                : undefined
            }
          />
        ) : null}

        <ChatInput disabled={pending || !accessToken} onSubmit={sendQuestion} />
      </main>
    </AppShell>
  );
}

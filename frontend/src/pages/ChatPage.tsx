import { useEffect, useRef } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ChatInput } from "../components/chat/ChatInput";
import { ErrorBanner } from "../components/chat/ErrorBanner";
import { MessageList } from "../components/chat/MessageList";
import { useAuth } from "../contexts/AuthContext";
import { useChat } from "../hooks/useChat";

export default function ChatPage() {
  const { user, accessToken, signOut } = useAuth();
  const { messages, pending, error, hasConversation, retry, send, startNewConversation } =
    useChat();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

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

        {error ? <ErrorBanner error={error} onRetry={retry ?? undefined} /> : null}

        <ChatInput disabled={!accessToken} pending={pending} onSubmit={send} />
      </main>
    </AppShell>
  );
}

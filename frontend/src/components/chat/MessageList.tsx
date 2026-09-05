export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

type MessageListProps = {
  messages: ChatMessage[];
  pending?: boolean;
};

export function MessageList({ messages, pending = false }: MessageListProps) {
  if (messages.length === 0 && !pending) {
    return (
      <div className="message-list message-list--empty" role="status">
        <p className="eyebrow">새 대화</p>
        <h2>무엇이든 물어보세요</h2>
        <p className="lede">
          질문은 같은 화면에 바로 쌓이고, 최근 성공한 대화를 문맥으로 이어갑니다.
        </p>
      </div>
    );
  }

  return (
    <div className="message-list" aria-live="polite">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`message message--${message.role}`}
          aria-label={message.role === "user" ? "내 질문" : "AI 응답"}
        >
          <p className="message__role">{message.role === "user" ? "나" : "Context"}</p>
          <p className="message__body">{message.content}</p>
        </article>
      ))}
      {pending ? (
        <article className="message message--assistant message--pending" aria-busy="true">
          <p className="message__role">Context</p>
          <p className="message__body">답변을 작성하고 있습니다…</p>
        </article>
      ) : null}
    </div>
  );
}

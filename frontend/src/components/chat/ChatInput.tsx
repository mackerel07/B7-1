import type { FormEvent } from "react";
import { useState } from "react";
import { QUESTION_MAX, validateQuestion } from "../../lib/api";

type ChatInputProps = {
  /** 전송 중은 아니지만 지금은 보낼 수 없는 상태 (예: 토큰 없음) */
  disabled?: boolean;
  /** 전송 요청이 진행 중인 상태 */
  pending?: boolean;
  onSubmit: (question: string) => Promise<void> | void;
};

export function ChatInput({
  disabled = false,
  pending = false,
  onSubmit,
}: ChatInputProps) {
  const locked = disabled || pending;
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateQuestion(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    const question = value.trim();
    setError(null);
    setValue("");
    await onSubmit(question);
  }

  const remaining = QUESTION_MAX - value.length;

  return (
    <form className="chat-input panel" onSubmit={handleSubmit} noValidate>
      <label className="visually-hidden" htmlFor="chat-question">
        질문 입력
      </label>
      <textarea
        id="chat-question"
        className="field__textarea chat-input__textarea"
        rows={3}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) setError(null);
        }}
        placeholder={`질문을 입력하세요 (최대 ${QUESTION_MAX.toLocaleString("ko-KR")}자)`}
        disabled={locked}
        maxLength={QUESTION_MAX}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "chat-question-error chat-question-hint" : "chat-question-hint"}
      />
      <div className="chat-input__footer">
        <p id="chat-question-hint" className="field__hint">
          {remaining.toLocaleString("ko-KR")}자 남음
        </p>
        <button className="btn btn--primary" type="submit" disabled={locked}>
          {pending ? "전송 중…" : "전송"}
        </button>
      </div>
      {error ? (
        <p id="chat-question-error" className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

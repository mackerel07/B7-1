import type { FormEvent } from "react";
import { useState } from "react";
import { validateQuestion } from "../../lib/api";

type ChatInputProps = {
  disabled?: boolean;
  onSubmit: (question: string) => Promise<void> | void;
};

export function ChatInput({ disabled = false, onSubmit }: ChatInputProps) {
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

  const remaining = 2000 - value.trim().length;

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
        placeholder="질문을 입력하세요 (최대 2,000자)"
        disabled={disabled}
        maxLength={2000}
      />
      <div className="chat-input__footer">
        <p className={`field__hint ${remaining < 0 ? "field__error" : ""}`}>
          {remaining.toLocaleString("ko-KR")}자 남음
        </p>
        <button className="btn btn--primary" type="submit" disabled={disabled}>
          {disabled ? "전송 중…" : "전송"}
        </button>
      </div>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

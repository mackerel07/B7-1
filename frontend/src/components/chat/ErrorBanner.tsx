import { ApiError } from "../../lib/api";

type ErrorBannerProps = {
  error: unknown;
  onRetry?: () => void;
};

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

  const code = error instanceof ApiError ? error.code : null;

  return (
    <div className="alert alert--error chat-error" role="alert">
      <div>
        <strong>{code ? `${code}: ` : null}문제가 발생했습니다</strong>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          다시 시도
        </button>
      ) : null}
    </div>
  );
}

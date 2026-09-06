export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
  details?: unknown;
};

export type ChatResponse = {
  id: string;
  conversation_id: string;
  answer: string;
  model: string;
  created_at: string;
};

export type ChatHistoryItem = {
  id: string;
  conversation_id: string;
  question: string;
  answer: string;
  model: string;
  created_at: string;
};

export type ChatHistoryResponse = {
  items: ChatHistoryItem[];
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string;

  constructor(code: string, message: string, status: number, requestId: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

const QUESTION_MAX = 2000;

export function validateQuestion(question: string): string | null {
  const trimmed = question.trim();
  if (!trimmed) {
    return "질문을 입력해 주세요.";
  }
  if (trimmed.length > QUESTION_MAX) {
    return `질문은 ${QUESTION_MAX.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.`;
  }
  return null;
}

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  return configured?.replace(/\/$/, "") ?? "";
}

async function parseError(response: Response): Promise<ApiError> {
  let payload: ApiErrorBody | null = null;
  try {
    payload = (await response.json()) as ApiErrorBody;
  } catch {
    payload = null;
  }

  return new ApiError(
    payload?.error?.code ?? "HTTP_ERROR",
    payload?.error?.message ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    response.status,
    payload?.error?.request_id ?? response.headers.get("x-request-id") ?? "unknown",
  );
}

export async function postChat(options: {
  accessToken: string;
  question: string;
  conversationId?: string | null;
}): Promise<ChatResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: options.question.trim(),
      conversation_id: options.conversationId ?? undefined,
    }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as ChatResponse;
}

export async function fetchMyChats(options: {
  accessToken: string;
  limit?: number;
}): Promise<ChatHistoryResponse> {
  const limit = options.limit ?? 20;
  const response = await fetch(`${getApiBaseUrl()}/api/me/chats?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as ChatHistoryResponse;
}

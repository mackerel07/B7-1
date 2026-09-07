import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

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

export const QUESTION_MAX = 2000;

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

/**
 * 401은 특정 화면의 문제가 아니라 세션 자체가 무효해진 상황이다.
 * 여기서 세션을 지우면 AuthContext가 상태 변화를 받아
 * ProtectedRoute가 로그인 화면으로 보낸다.
 */
async function clearSessionIfUnauthorized(response: Response): Promise<void> {
  if (response.status !== 401) {
    return;
  }
  try {
    if (!isSupabaseConfigured()) {
      return;
    }
    await getSupabaseClient().auth.signOut();
  } catch {
    // 세션 정리에 실패해도 원래 오류는 그대로 호출자에게 전달한다
  }
}

/** 응답 본문을 ApiError로 옮긴다. 부수효과는 없다. */
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

type RequestOptions = {
  accessToken: string;
  method?: string;
  body?: unknown;
};

/**
 * 모든 API 호출이 지나는 지점.
 * 인증 헤더와 화면에 무관한 처리(401 세션 정리)를 여기서 한 번만 한다.
 * 개별 엔드포인트 함수는 경로와 본문만 다룬다.
 */
async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    await clearSessionIfUnauthorized(response);
    throw await parseError(response);
  }

  return (await response.json()) as T;
}

export async function postChat(options: {
  accessToken: string;
  question: string;
  conversationId?: string | null;
}): Promise<ChatResponse> {
  return request<ChatResponse>("/api/chat", {
    accessToken: options.accessToken,
    method: "POST",
    body: {
      question: options.question.trim(),
      conversation_id: options.conversationId ?? undefined,
    },
  });
}

export async function fetchMyChats(options: {
  accessToken: string;
  limit?: number;
}): Promise<ChatHistoryResponse> {
  const limit = options.limit ?? 20;
  return request<ChatHistoryResponse>(`/api/me/chats?limit=${limit}`, {
    accessToken: options.accessToken,
  });
}

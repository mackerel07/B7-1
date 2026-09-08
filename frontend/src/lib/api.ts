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

/**
 * 클라이언트 자체 타임아웃.
 * 서버 전체 상한(인증 8s + 문맥 조회 8s + Gemini 25s + 저장 8s)보다 길게 잡는다.
 * 짧게 잡으면 정상 처리 중인 요청을 끊게 되고, 멱등성을 보장하지 않기로 했으므로
 * 그 재전송이 중복 저장으로 이어진다.
 */
const REQUEST_TIMEOUT_MS = 50_000;

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

/**
 * 재시도 버튼을 보여줄지 판단한다. `docs/API_CONTRACT.md`의 오류 코드 표 기준.
 *
 * - 5xx (`AI_SERVICE_ERROR`, `DATABASE_*`, `AI_TIMEOUT`): 서버 측 일시적 실패이므로 재시도가 유효하다.
 * - 4xx (`VALIDATION_ERROR`): 요청 자체를 고쳐야 하므로 같은 요청을 다시 보내도 결과가 같다.
 * - 401은 세션을 정리하고 로그인 화면으로 이동하므로 배너 자체를 띄우지 않는다.
 * - status 0은 응답을 아예 받지 못한 경우(타임아웃·네트워크 단절)로, 일시적일 수 있다.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 0 || error.status >= 500;
  }
  // 계약에 없는 실패(네트워크 단절 등)는 일시적일 수 있으므로 재시도를 허용한다
  return true;
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

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    // 아래 두 경우는 서버 응답을 받지 못한 것이라 HTTP 상태가 없다. status 0으로 표시한다.
    //
    // 5xx는 서버가 실패를 알려준 것이라 저장되지 않은 게 확실하지만,
    // 여기서는 서버가 이미 처리를 마쳤을 수도 있다. 멱등성을 보장하지 않기로 했으므로
    // 재시도가 중복 저장으로 이어질 수 있어, 사용자가 판단하도록 안내 문구를 다르게 둔다.
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError(
        "CLIENT_TIMEOUT",
        "응답을 받지 못했습니다. 질문이 이미 처리됐을 수 있으니 기록에서 확인한 뒤 다시 보내 주세요.",
        0,
        "unknown",
      );
    }
    // fetch는 네트워크 단절·DNS 실패·CORS 차단에서 TypeError로 거부한다
    if (error instanceof TypeError) {
      throw new ApiError(
        "NETWORK_ERROR",
        "네트워크에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
        0,
        "unknown",
      );
    }
    throw error;
  }

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

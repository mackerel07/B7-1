import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  fetchMyChats,
  isRetryableError,
  postChat,
  validateQuestion,
} from "./api";

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));

vi.mock("./supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({ auth: { signOut: signOutMock } }),
}));

beforeEach(() => {
  signOutMock.mockReset();
  signOutMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("postChat", () => {
  it("Bearer 토큰과 질문을 보내 성공 응답을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "11111111-1111-1111-1111-111111111111",
        conversation_id: "22222222-2222-2222-2222-222222222222",
        answer: "안녕하세요",
        model: "gemini-test",
        created_at: "2026-09-05T00:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postChat({
      accessToken: "token-123",
      question: "  안녕  ",
      conversationId: "22222222-2222-2222-2222-222222222222",
    });

    expect(result.answer).toBe("안녕하세요");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        }),
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      question: string;
    };
    expect(body.question).toBe("안녕");
  });

  it("실패 응답을 ApiError로 변환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        headers: { get: () => "req-1" },
        json: async () => ({
          error: {
            code: "AI_TIMEOUT",
            message: "현재 응답이 지연되고 있어요.",
            request_id: "req-1",
          },
        }),
      }),
    );

    await expect(
      postChat({ accessToken: "token", question: "질문" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "AI_TIMEOUT",
      status: 504,
    });
  });
});

describe("fetchMyChats", () => {
  it("내 대화 목록을 조회한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "1",
            conversation_id: "c1",
            question: "Q",
            answer: "A",
            model: "gemini-test",
            created_at: "2026-09-05T00:00:00Z",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMyChats({ accessToken: "token", limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me/chats?limit=10",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      }),
    );
  });
});

describe("validateQuestion", () => {
  it("공백과 길이 제한을 검사한다", () => {
    expect(validateQuestion("")).toBeTruthy();
    expect(validateQuestion("a".repeat(2001))).toBeTruthy();
    expect(validateQuestion("정상 질문")).toBeNull();
  });

  it("ApiError 인스턴스를 생성할 수 있다", () => {
    const error = new ApiError("AUTH_REQUIRED", "로그인이 필요합니다.", 401, "r1");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("AUTH_REQUIRED");
  });
});

describe("401 전역 처리", () => {
  function stubErrorResponse(status: number, code: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => ({
          error: { code, message: "메시지", request_id: "r1" },
        }),
        headers: { get: () => null },
      }),
    );
  }

  it("401이면 세션을 정리한다", async () => {
    stubErrorResponse(401, "AUTH_INVALID_TOKEN");

    await expect(postChat({ accessToken: "expired", question: "안녕" })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("기록 조회에서도 401이면 세션을 정리한다", async () => {
    stubErrorResponse(401, "AUTH_REQUIRED");

    await expect(fetchMyChats({ accessToken: "expired" })).rejects.toBeInstanceOf(ApiError);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("401이 아닌 오류에서는 세션을 유지한다", async () => {
    stubErrorResponse(502, "AI_SERVICE_ERROR");

    await expect(postChat({ accessToken: "token", question: "안녕" })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("세션 정리가 실패해도 원래 오류를 그대로 던진다", async () => {
    stubErrorResponse(401, "AUTH_INVALID_TOKEN");
    signOutMock.mockRejectedValue(new Error("network down"));

    await expect(
      postChat({ accessToken: "expired", question: "안녕" }),
    ).rejects.toMatchObject({ code: "AUTH_INVALID_TOKEN", status: 401 });
  });
});

describe("isRetryableError", () => {
  it("서버 측 일시적 실패(5xx)는 재시도를 허용한다", () => {
    expect(isRetryableError(new ApiError("AI_SERVICE_ERROR", "", 502, "r1"))).toBe(true);
    expect(isRetryableError(new ApiError("DATABASE_ERROR", "", 503, "r1"))).toBe(true);
    expect(isRetryableError(new ApiError("AI_TIMEOUT", "", 504, "r1"))).toBe(true);
  });

  it("요청을 고쳐야 하는 실패(4xx)는 재시도를 막는다", () => {
    expect(isRetryableError(new ApiError("VALIDATION_ERROR", "", 422, "r1"))).toBe(false);
    expect(isRetryableError(new ApiError("AUTH_INVALID_TOKEN", "", 401, "r1"))).toBe(false);
  });

  it("계약에 없는 실패는 일시적일 수 있으므로 재시도를 허용한다", () => {
    expect(isRetryableError(new ApiError("CLIENT_TIMEOUT", "", 0, "unknown"))).toBe(true);
    expect(isRetryableError(new ApiError("NETWORK_ERROR", "", 0, "unknown"))).toBe(true);
    expect(isRetryableError(new Error("알 수 없음"))).toBe(true);
  });
});

describe("클라이언트 타임아웃", () => {
  it("타임아웃되면 CLIENT_TIMEOUT으로 변환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    );

    await expect(
      postChat({ accessToken: "token", question: "안녕" }),
    ).rejects.toMatchObject({
      code: "CLIENT_TIMEOUT",
      status: 0,
      // 5xx와 달리 서버가 이미 처리했을 수 있음을 알린다
      message: expect.stringContaining("이미 처리됐을 수 있으니"),
    });
  });

  it("네트워크 단절은 한글 안내를 담은 NETWORK_ERROR로 변환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(
      postChat({ accessToken: "token", question: "안녕" }),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
      message: "네트워크에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
    });
  });

  it("알 수 없는 예외는 그대로 전달한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    await expect(
      postChat({ accessToken: "token", question: "안녕" }),
    ).rejects.toThrowError("boom");
  });
});

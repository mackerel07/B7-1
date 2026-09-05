import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchMyChats, postChat, validateQuestion } from "./api";

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

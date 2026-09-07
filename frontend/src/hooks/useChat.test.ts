import { act, renderHook } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChat } from "./useChat";
import { mockUseAuth } from "../test/mockAuth";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

function stubChatResponse() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      id: "1",
      conversation_id: "CONV-1",
      answer: "답변",
      model: "gemini-test",
      created_at: "2026-09-06T00:00:00Z",
    }),
    headers: { get: () => null },
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useChat 중복 전송 차단", () => {
  /**
   * 화면에서는 버튼이 disabled라 재현되지 않지만, send는 훅 밖으로 공개돼 있어
   * 같은 렌더에서 두 번 호출될 수 있다. pending 상태만으로는 막지 못한다.
   */
  it("같은 렌더에서 두 번 호출해도 요청은 한 번만 나간다", async () => {
    const fetchMock = stubChatResponse();
    mockUseAuth({
      user: { id: "user-1", email: "tester@example.com" } as unknown as User,
      accessToken: "token-123",
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await Promise.all([result.current.send("첫 번째"), result.current.send("두 번째")]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).question).toBe("첫 번째");
  });

  it("전송이 끝나면 다시 보낼 수 있다", async () => {
    const fetchMock = stubChatResponse();
    mockUseAuth({
      user: { id: "user-1", email: "tester@example.com" } as unknown as User,
      accessToken: "token-123",
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.send("첫 번째");
    });
    await act(async () => {
      await result.current.send("두 번째");
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

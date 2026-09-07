import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import ChatPage from "./ChatPage";
import { mockUseAuth } from "../test/mockAuth";

beforeAll(() => {
  // jsdom에는 scrollIntoView 구현이 없다
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(status: number, code: string, message: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: { code, message, request_id: "r1" } }),
      headers: { get: () => null },
    }),
  );
}

function renderChatPage() {
  mockUseAuth({
    user: { id: "user-1", email: "tester@example.com" } as unknown as User,
    accessToken: "token-123",
  });

  render(
    <MemoryRouter initialEntries={["/chat"]}>
      <ChatPage />
    </MemoryRouter>,
  );
}

async function askQuestion() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("질문 입력"), "안녕하세요");
  await user.click(screen.getByRole("button", { name: "전송" }));
}

describe("ChatPage 오류 표시", () => {
  it("401은 곧 로그인 화면으로 이동하므로 배너를 띄우지 않는다", async () => {
    stubFetch(401, "AUTH_INVALID_TOKEN", "세션이 만료되었습니다.");
    renderChatPage();

    await askQuestion();

    // 전송이 끝나 버튼이 돌아왔는데도 배너가 없어야 한다
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "전송" })).toBeEnabled(),
    );
    expect(screen.queryByText("세션이 만료되었습니다.")).not.toBeInTheDocument();
  });

  it("401이 아닌 오류는 코드와 메시지를 배너로 안내한다", async () => {
    stubFetch(502, "AI_SERVICE_ERROR", "AI 답변을 생성하지 못했습니다.");
    renderChatPage();

    await askQuestion();

    await waitFor(() =>
      expect(screen.getByText("AI 답변을 생성하지 못했습니다.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("AI_SERVICE_ERROR");
  });

  it("입력을 고쳐야 하는 422에는 재시도 버튼을 노출하지 않는다", async () => {
    stubFetch(422, "VALIDATION_ERROR", "요청 형식이 올바르지 않습니다.");
    renderChatPage();

    await askQuestion();

    await waitFor(() =>
      expect(screen.getByText("요청 형식이 올바르지 않습니다.")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  it("서버 측 일시적 실패에는 재시도 버튼을 노출한다", async () => {
    stubFetch(504, "AI_TIMEOUT", "AI 응답 시간이 초과되었습니다.");
    renderChatPage();

    await askQuestion();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument(),
    );
  });

  it("실패해도 보낸 질문은 화면에 남는다", async () => {
    stubFetch(504, "AI_TIMEOUT", "AI 응답 시간이 초과되었습니다.");
    renderChatPage();

    await askQuestion();

    await waitFor(() =>
      expect(screen.getByText("AI 응답 시간이 초과되었습니다.")).toBeInTheDocument(),
    );
    expect(screen.getByText("안녕하세요")).toBeInTheDocument();
  });
});

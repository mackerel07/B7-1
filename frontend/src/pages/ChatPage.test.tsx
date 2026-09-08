import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import ChatPage from "./ChatPage";
import type { ChatMessage } from "../components/chat/MessageList";
import { mockUseAuth } from "../test/mockAuth";

beforeAll(() => {
  // jsdom에는 scrollIntoView 구현이 없다
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const STORAGE_KEY = "b7-1:chat:conversation:user-1";

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
}

function chatResponse(conversationId: string, id: string, answer: string) {
  return okResponse({
    id,
    conversation_id: conversationId,
    answer,
    model: "gemini-test",
    created_at: "2026-09-06T00:00:00Z",
  });
}

function errorResponse(status: number, code: string, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message, request_id: "r1" } }),
    headers: { get: () => null },
  };
}

function storedConversation(conversationId: string, messages: unknown[]) {
  return JSON.stringify({ conversationId, messages });
}

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

async function askQuestion(text = "안녕하세요") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("질문 입력"), text);
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

describe("ChatPage 대화 유지", () => {
  it("첫 질문에는 conversation_id를 보내지 않고, 받은 값을 다음 질문에 실어 보낸다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("CONV-1", "1", "답변1"))
      .mockResolvedValueOnce(chatResponse("CONV-1", "2", "답변2"));
    vi.stubGlobal("fetch", fetchMock);
    renderChatPage();

    await askQuestion("첫 질문");
    await waitFor(() => expect(screen.getByText("답변1")).toBeInTheDocument());
    await askQuestion("두 번째 질문");
    await waitFor(() => expect(screen.getByText("답변2")).toBeInTheDocument());

    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first.conversation_id).toBeUndefined();
    expect(second.conversation_id).toBe("CONV-1");
  });

  it("저장된 대화가 있으면 화면을 그대로 되살린다", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      storedConversation("CONV-1", [
        { id: "1-question", role: "user", content: "이전 질문" },
        { id: "1", role: "assistant", content: "이전 답변" },
      ]),
    );

    renderChatPage();

    expect(screen.getByText("이전 질문")).toBeInTheDocument();
    expect(screen.getByText("이전 답변")).toBeInTheDocument();
  });

  it("서버가 성공으로 응답한 것만 저장하고, 실패한 질문은 저장하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(chatResponse("CONV-1", "1", "답변1"))
        .mockResolvedValueOnce(
          errorResponse(502, "AI_SERVICE_ERROR", "AI 답변을 생성하지 못했습니다."),
        ),
    );
    renderChatPage();

    await askQuestion("성공할 질문");
    await waitFor(() => expect(screen.getByText("답변1")).toBeInTheDocument());
    await askQuestion("실패할 질문");
    await waitFor(() =>
      expect(screen.getByText("AI 답변을 생성하지 못했습니다.")).toBeInTheDocument(),
    );

    // 화면에는 남지만
    expect(screen.getByText("실패할 질문")).toBeInTheDocument();
    // 저장에는 들어가지 않는다
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored.messages.map((m: ChatMessage) => m.content)).toEqual([
      "성공할 질문",
      "답변1",
    ]);
  });

  it("손상된 저장값은 무시하고 새 대화로 시작한다", () => {
    sessionStorage.setItem(STORAGE_KEY, "{망가진 JSON");

    renderChatPage();

    expect(screen.getByText("무엇이든 물어보세요")).toBeInTheDocument();
  });

  it("새 채팅을 누르면 화면과 저장된 대화를 비운다", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      storedConversation("CONV-1", [
        { id: "1-question", role: "user", content: "이전 질문" },
        { id: "1", role: "assistant", content: "이전 답변" },
      ]),
    );
    renderChatPage();

    await userEvent.setup().click(screen.getByRole("button", { name: "새 채팅" }));

    expect(screen.queryByText("이전 질문")).not.toBeInTheDocument();
    expect(screen.getByText("무엇이든 물어보세요")).toBeInTheDocument();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

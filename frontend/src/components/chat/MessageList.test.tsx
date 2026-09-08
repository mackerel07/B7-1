import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageList } from "./MessageList";

describe("MessageList", () => {
  it("shows empty state copy", () => {
    render(<MessageList messages={[]} />);
    expect(screen.getByText("무엇이든 물어보세요")).toBeInTheDocument();
  });

  it("renders user and assistant messages", () => {
    render(
      <MessageList
        messages={[
          { id: "1", role: "user", content: "질문입니다" },
          { id: "2", role: "assistant", content: "답변입니다" },
        ]}
      />,
    );
    expect(screen.getByText("질문입니다")).toBeInTheDocument();
    expect(screen.getByText("답변입니다")).toBeInTheDocument();
  });

  it("announces pending assistant state", () => {
    render(<MessageList messages={[]} pending />);
    expect(screen.getByText("답변을 작성하고 있습니다…")).toBeInTheDocument();
  });

  it("답변을 기다리는 동안에도 앞선 메시지를 계속 보여준다", () => {
    render(
      <MessageList
        messages={[
          { id: "1", role: "user", content: "먼저 보낸 질문" },
          { id: "2", role: "assistant", content: "먼저 받은 답변" },
          { id: "3", role: "user", content: "방금 보낸 질문" },
        ]}
        pending
      />,
    );

    expect(screen.getByText("먼저 보낸 질문")).toBeInTheDocument();
    expect(screen.getByText("먼저 받은 답변")).toBeInTheDocument();
    expect(screen.getByText("방금 보낸 질문")).toBeInTheDocument();
    expect(screen.getByText("답변을 작성하고 있습니다…")).toBeInTheDocument();
  });

  it("메시지가 있으면 빈 상태 안내를 보여주지 않는다", () => {
    render(<MessageList messages={[{ id: "1", role: "user", content: "질문" }]} />);
    expect(screen.queryByText("무엇이든 물어보세요")).not.toBeInTheDocument();
  });
});

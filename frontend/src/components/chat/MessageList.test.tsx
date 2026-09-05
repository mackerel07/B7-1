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
});

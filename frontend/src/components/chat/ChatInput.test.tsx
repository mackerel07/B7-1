import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "./ChatInput";

describe("ChatInput", () => {
  it("빈 입력은 전송하지 않고 오류를 보여준다", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "전송" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("질문을 입력해 주세요.");
  });

  it("유효한 질문을 전송하고 입력값을 비운다", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText("질문 입력");
    await user.type(textarea, "안녕하세요");
    await user.click(screen.getByRole("button", { name: "전송" }));

    expect(onSubmit).toHaveBeenCalledWith("안녕하세요");
    expect(textarea).toHaveValue("");
  });

  it("남은 글자수를 공백 포함 입력 길이 기준으로 표시한다", async () => {
    const user = userEvent.setup();
    render(<ChatInput onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("질문 입력"), "  안녕  ");

    expect(screen.getByText("1,994자 남음")).toBeInTheDocument();
  });

  it("disabled면 전송 중이 아니므로 라벨은 그대로 두고 비활성화만 한다", () => {
    render(<ChatInput disabled onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "전송" })).toBeDisabled();
  });

  it("pending이면 전송 중임을 표시하고 입력을 잠근다", () => {
    render(<ChatInput pending onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "전송 중…" })).toBeDisabled();
    expect(screen.getByLabelText("질문 입력")).toBeDisabled();
  });
});

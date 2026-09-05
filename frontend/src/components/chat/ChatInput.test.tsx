import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "./ChatInput";
import { ErrorBanner } from "./ErrorBanner";
import { ApiError } from "../../lib/api";

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

  it("disabled면 전송 버튼이 비활성화된다", () => {
    render(<ChatInput disabled onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "전송 중…" })).toBeDisabled();
  });
});

describe("ErrorBanner", () => {
  it("ApiError 코드와 다시 시도 버튼을 표시한다", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorBanner
        error={new ApiError("AI_TIMEOUT", "응답이 지연되고 있어요.", 504, "r1")}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("AI_TIMEOUT");
    expect(screen.getByRole("alert")).toHaveTextContent("응답이 지연되고 있어요.");
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

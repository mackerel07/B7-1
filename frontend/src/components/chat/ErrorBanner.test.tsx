import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorBanner } from "./ErrorBanner";
import { ApiError } from "../../lib/api";

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

  /**
   * 재시도가 무의미한 오류(422 등)에서는 호출자가 onRetry를 넘기지 않는다.
   * 그 판단이 화면에 실제로 반영되는 지점이 여기다.
   */
  it("onRetry가 없으면 다시 시도 버튼을 그리지 않는다", () => {
    render(
      <ErrorBanner
        error={new ApiError("VALIDATION_ERROR", "요청 형식이 올바르지 않습니다.", 422, "r1")}
      />,
    );

    expect(screen.getByText("요청 형식이 올바르지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  it("ApiError가 아닌 오류는 코드 없이 메시지만 보여준다", () => {
    render(<ErrorBanner error={new Error("무언가 잘못됐습니다.")} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("무언가 잘못됐습니다.");
    expect(alert).toHaveTextContent("문제가 발생했습니다");
  });

  it("오류 객체가 아니면 기본 안내 문구를 보여준다", () => {
    render(<ErrorBanner error="문자열 오류" />);

    expect(
      screen.getByText("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
  });
});

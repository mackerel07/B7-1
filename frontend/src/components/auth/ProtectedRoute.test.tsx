import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";
import { mockUseAuth } from "../../test/mockAuth";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProtectedRoute", () => {
  it("로딩 중에는 세션 확인 안내를 보여준다", () => {
    mockUseAuth({ loading: true, user: null });

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ProtectedRoute>
          <div>보호된 내용</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("세션 확인 중")).toBeInTheDocument();
    expect(screen.queryByText("보호된 내용")).not.toBeInTheDocument();
  });

  it("비로그인이면 로그인 경로로 보낸다", () => {
    mockUseAuth({ loading: false, user: null });

    render(
      <MemoryRouter initialEntries={["/history"]}>
        <Routes>
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <div>기록 화면</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>로그인 화면</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("로그인 화면")).toBeInTheDocument();
    expect(screen.queryByText("기록 화면")).not.toBeInTheDocument();
  });

  it("로그인 상태면 자식 화면을 렌더한다", () => {
    mockUseAuth({
      loading: false,
      user: { id: "u1", email: "user@example.com" } as never,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>보호된 내용</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("보호된 내용")).toBeInTheDocument();
  });

  it("로딩 상태에 aria-busy를 둔다", () => {
    mockUseAuth({ loading: true });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>secret</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });
});

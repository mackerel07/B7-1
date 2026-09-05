import { vi } from "vitest";
import * as AuthModule from "../contexts/AuthContext";

type MockAuth = Partial<ReturnType<typeof AuthModule.useAuth>>;

export function mockUseAuth(overrides: MockAuth = {}) {
  const value = {
    user: null,
    session: null,
    loading: false,
    configured: true,
    accessToken: null,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };

  vi.spyOn(AuthModule, "useAuth").mockReturnValue(
    value as ReturnType<typeof AuthModule.useAuth>,
  );
  return value;
}

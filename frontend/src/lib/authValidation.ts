export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) {
    return "이메일을 입력해 주세요.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "올바른 이메일 형식이 아닙니다.";
  }
  return null;
}

export function validatePassword(password: string, { min = 6 } = {}): string | null {
  if (!password) {
    return "비밀번호를 입력해 주세요.";
  }
  if (password.length < min) {
    return `비밀번호는 ${min}자 이상이어야 합니다.`;
  }
  return null;
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    const message = error.message.toLowerCase();
    if (message.includes("invalid login credentials")) {
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    }
    if (message.includes("user already registered")) {
      return "이미 가입된 이메일입니다.";
    }
    if (message.includes("email")) {
      return "이메일 관련 설정을 확인해 주세요. 잠시 후 다시 시도해 주세요.";
    }
    return error.message;
  }
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

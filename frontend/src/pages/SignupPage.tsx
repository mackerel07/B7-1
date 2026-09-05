import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { useAuth } from "../contexts/AuthContext";
import {
  authErrorMessage,
  validateEmail,
  validatePassword,
} from "../lib/authValidation";

export default function SignupPage() {
  const { user, loading, configured, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/chat" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError) nextErrors.email = emailError;
    if (passwordError) nextErrors.password = passwordError;
    if (password !== confirm) {
      nextErrors.confirm = "비밀번호 확인이 일치하지 않습니다.";
    }

    setFieldErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (!configured) {
      setFormError("Supabase 환경 변수가 설정되지 않았습니다.");
      return;
    }

    setSubmitting(true);
    try {
      await signUp(email.trim(), password);
      navigate("/chat", { replace: true });
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell showNav={false}>
      <main className="page auth-hero">
        <div className="auth-hero__copy">
          <p className="eyebrow">Context</p>
          <h1>계정을 만들고 대화를 시작하세요</h1>
          <p className="lede">
            이메일과 비밀번호로 가입하면 질문, AI 응답, 기록이 사용자별로 안전하게
            분리됩니다.
          </p>
        </div>

        <form className="panel auth-hero__form stack" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="signup-email">
              이메일
            </label>
            <input
              id="signup-email"
              className="field__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              required
            />
            {fieldErrors.email ? (
              <p className="field__error" role="alert">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="signup-password">
              비밀번호
            </label>
            <input
              id="signup-password"
              className="field__input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
              minLength={6}
            />
            {fieldErrors.password ? (
              <p className="field__error" role="alert">
                {fieldErrors.password}
              </p>
            ) : (
              <p className="field__hint">6자 이상 입력해 주세요.</p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="signup-confirm">
              비밀번호 확인
            </label>
            <input
              id="signup-confirm"
              className="field__input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              disabled={submitting}
              required
            />
            {fieldErrors.confirm ? (
              <p className="field__error" role="alert">
                {fieldErrors.confirm}
              </p>
            ) : null}
          </div>

          {formError ? (
            <div className="alert alert--error" role="alert">
              {formError}
            </div>
          ) : null}

          <button className="btn btn--primary" type="submit" disabled={submitting}>
            {submitting ? "가입 중…" : "회원가입"}
          </button>

          <p className="auth-switch">
            이미 계정이 있나요? <Link to="/login">로그인</Link>
          </p>
        </form>
      </main>
    </AppShell>
  );
}

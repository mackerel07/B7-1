import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { useAuth } from "../contexts/AuthContext";
import {
  authErrorMessage,
  validateEmail,
  validatePassword,
} from "../lib/authValidation";

export default function LoginPage() {
  const { user, loading, configured, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      await signIn(email.trim(), password);
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
          <h1>다시 오신 것을 환영합니다</h1>
          <p className="lede">
            로그인하면 이전 문맥을 이어 질문하고, 본인 대화만 안전하게 확인할 수
            있습니다.
          </p>
        </div>

        <form className="panel auth-hero__form stack" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="login-email">
              이메일
            </label>
            <input
              id="login-email"
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
            <label className="field__label" htmlFor="login-password">
              비밀번호
            </label>
            <input
              id="login-password"
              className="field__input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
            />
            {fieldErrors.password ? (
              <p className="field__error" role="alert">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          {formError ? (
            <div className="alert alert--error" role="alert">
              {formError}
            </div>
          ) : null}

          <button className="btn btn--primary" type="submit" disabled={submitting}>
            {submitting ? "로그인 중…" : "로그인"}
          </button>

          <p className="auth-switch">
            계정이 없나요? <Link to="/signup">회원가입</Link>
          </p>
        </form>
      </main>
    </AppShell>
  );
}

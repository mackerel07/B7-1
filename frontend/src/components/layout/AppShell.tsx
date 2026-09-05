import { Link, NavLink } from "react-router-dom";
import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  email?: string | null;
  onLogout?: () => void;
  showNav?: boolean;
};

export function AppShell({
  children,
  email,
  onLogout,
  showNav = true,
}: AppShellProps) {
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <Link to={email ? "/chat" : "/login"} className="brand" aria-label="Context 홈">
            <span className="brand__mark" aria-hidden="true" />
            <span className="brand__name">Context</span>
          </Link>

          {showNav && email ? (
            <nav className="site-nav" aria-label="주요 메뉴">
              <NavLink to="/chat" className={navClass} end={false}>
                채팅
              </NavLink>
              <NavLink to="/history" className={navClass}>
                기록
              </NavLink>
              <div className="site-nav__account">
                <span className="site-nav__email" title={email}>
                  <span className="visually-hidden">로그인 계정: </span>
                  {email}
                </span>
                {onLogout ? (
                  <button type="button" className="btn btn--ghost" onClick={onLogout}>
                    로그아웃
                  </button>
                ) : null}
              </div>
            </nav>
          ) : null}
        </div>
      </header>
      <div id="main-content">{children}</div>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "site-nav__link is-active" : "site-nav__link";
}

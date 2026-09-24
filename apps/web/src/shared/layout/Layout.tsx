import type { ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { clearAuthToken, readAuthToken } from '../auth.ts';

export function Layout({ children }: { children: ReactNode }) {
  useRouterState({ select: (state) => state.location.pathname });
  const hasToken = readAuthToken() !== null;

  return (
    <div className="layout">
      <a href="#main-content" className="skip-link">
        본문으로 건너뛰기
      </a>
      <header className="layout-header">
        <div className="layout-header-inner">
          <Link to="/" className="layout-brand">
            Authority Diff
          </Link>
          <nav className="layout-nav" aria-label="주 메뉴">
            <Link to="/" activeOptions={{ exact: true }} activeProps={{ 'aria-current': 'page' }}>
              활동 분포
            </Link>
            <Link to="/conformance" activeProps={{ 'aria-current': 'page' }}>
              적합성
            </Link>
            {!hasToken ? (
              <Link to="/login" activeProps={{ 'aria-current': 'page' }}>
                로그인
              </Link>
            ) : null}
          </nav>
          {hasToken ? (
            <button
              type="button"
              onClick={() => {
                clearAuthToken();
                window.location.assign('/login');
              }}
            >
              로그아웃
            </button>
          ) : null}
        </div>
      </header>
      <main id="main-content" className="layout-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

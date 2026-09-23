import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { clearAuthToken, readAuthToken } from '../auth.ts';

export function Layout({ children }: { children: ReactNode }) {
  const hasToken = readAuthToken() !== null;

  return (
    <div className="layout">
      <header className="layout-header">
        <div className="layout-header-inner">
          <div className="layout-brand">Authority Diff</div>
          <nav className="layout-nav" aria-label="주 메뉴">
            <Link to="/">활동 분포</Link>
            <Link to="/conformance">적합성</Link>
            {!hasToken ? <Link to="/login">로그인</Link> : null}
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
      <main className="layout-main">{children}</main>
    </div>
  );
}

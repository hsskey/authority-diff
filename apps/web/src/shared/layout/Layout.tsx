import type { ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { clearAuthToken, readAuthToken } from '../auth.ts';

export function Layout({ children }: { children: ReactNode }) {
  useRouterState({ select: (state) => state.location.pathname });
  const hasToken = readAuthToken() !== null;

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr]">
      <a href="#main-content" className="skip-link">
        본문으로 건너뛰기
      </a>
      <header className="layout-header border-b border-border bg-panel px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-4">
          <Link to="/" className="font-semibold whitespace-nowrap no-underline">
            Authority Diff
          </Link>
          <nav
            className="layout-nav flex flex-wrap gap-x-4 gap-y-2 whitespace-nowrap"
            aria-label="주 메뉴"
          >
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
              className="ml-auto"
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
      <main id="main-content" className="layout-main mx-auto w-full max-w-5xl p-6" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

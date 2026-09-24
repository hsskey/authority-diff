import type { ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { clearAuthToken, readAuthToken } from '../auth.ts';

export function Layout({ children }: { children: ReactNode }) {
  useRouterState({ select: (state) => state.location.pathname });
  const hasToken = readAuthToken() !== null;

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr]">
      <a
        href="#main-content"
        className="absolute top-3 left-3 z-10 -translate-y-[200%] rounded-md bg-gray-900 px-3 py-[0.4rem] text-white no-underline focus:translate-y-0"
      >
        본문으로 건너뛰기
      </a>
      <header className="border-b border-border bg-panel px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-4">
          <Link to="/" className="font-semibold whitespace-nowrap no-underline">
            Authority Diff
          </Link>
          <nav
            className="flex flex-wrap gap-x-4 gap-y-2 whitespace-nowrap [&_[aria-current=page]]:font-bold [&_[aria-current=page]]:underline [&_[aria-current=page]]:underline-offset-[0.2em]"
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
              className="ml-auto cursor-pointer rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-white"
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
      <main id="main-content" className="mx-auto w-full max-w-5xl p-6" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

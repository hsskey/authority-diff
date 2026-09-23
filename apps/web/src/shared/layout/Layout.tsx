import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { clearAuthToken, readAuthToken } from '../auth.ts';

export function Layout({ children }: { children: ReactNode }) {
  const hasToken = readAuthToken() !== null;

  return (
    <div className="layout">
      <header className="layout-header">
        <div className="layout-brand">Authority Diff</div>
        <nav className="layout-nav" aria-label="Primary">
          <Link to="/">활동 분포</Link>
          <Link to="/conformance">적합성</Link>
          {!hasToken ? <Link to="/login">Sign in</Link> : null}
        </nav>
        {hasToken ? (
          <button
            type="button"
            onClick={() => {
              clearAuthToken();
              window.location.assign('/login');
            }}
          >
            Sign out
          </button>
        ) : null}
      </header>
      <main className="layout-main">{children}</main>
    </div>
  );
}

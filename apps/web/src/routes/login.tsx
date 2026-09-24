import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { writeAuthToken } from '../shared/auth.ts';
import { PageTitle } from '../shared/components/PageTitle.tsx';
import { Panel } from '../shared/components/Panel.tsx';
import { usePageTitle } from '../shared/use-page-title.ts';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  usePageTitle('로그인');

  return (
    <section>
      <PageTitle>로그인</PageTitle>
      <Panel
        as="form"
        className="grid max-w-96 gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          writeAuthToken(token.trim());
          void navigate({ to: '/' });
        }}
      >
        <label className="grid gap-1">
          Bearer token
          <input
            className="rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            name="token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          className="cursor-pointer rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-white"
        >
          token 저장
        </button>
      </Panel>
    </section>
  );
}

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
        className="login-form"
        onSubmit={(event) => {
          event.preventDefault();
          writeAuthToken(token.trim());
          void navigate({ to: '/' });
        }}
      >
        <label>
          Bearer token
          <input
            name="token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
        </label>
        <button type="submit">token 저장</button>
      </Panel>
    </section>
  );
}

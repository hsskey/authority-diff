import { describe, expect, it } from 'vitest';

import { checkCssPolicy } from '../check-css-policy.ts';

const allowedAppCss = `@import "tailwindcss";

@theme {
  --color-surface: #f6f7f9;
  --color-muted: #6b7280;
}

@layer base {
  :root {
    color-scheme: light dark;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --color-surface: #0f1115;
      --color-muted: #9ca3af;
    }
  }

  :focus-visible {
    outline: 2px solid #2563eb;
  }
}
`;

describe('checkCssPolicy', () => {
  it('accepts the allowed stylesheet and a css import only from main.tsx', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: allowedAppCss,
      sourceFiles: [{ path: 'main.tsx', source: "import './styles/app.css';\n" }],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects any css file other than styles/app.css', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css', 'extra.css'],
      appCss: allowedAppCss,
      sourceFiles: [{ path: 'main.tsx', source: "import './styles/app.css';\n" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('extra.css'))).toBe(true);
  });

  it('rejects a missing styles/app.css', () => {
    const result = checkCssPolicy({
      cssFiles: [],
      sourceFiles: [{ path: 'main.tsx', source: "import './styles/app.css';\n" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('styles/app.css'))).toBe(true);
  });

  it('rejects a top-level selector outside @layer base', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: `${allowedAppCss}\n.panel { background: #ffffff; }\n`,
      sourceFiles: [{ path: 'main.tsx', source: "import './styles/app.css';\n" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('@layer base'))).toBe(true);
  });

  it('rejects @layer utilities', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: `@import "tailwindcss";
@theme { --color-surface: #f6f7f9; }
@layer utilities {
  .card { display: grid; }
}
`,
      sourceFiles: [{ path: 'main.tsx', source: "import './styles/app.css';\n" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('utilities'))).toBe(true);
  });

  it.each([
    '@import "tailwindcss/theme" layer(theme);',
    '@import "tailwindcss/utilities" layer(utilities);',
    '@import "tailwindcss/preflight" layer(base);',
    '@import "tailwindcss" layer(base);',
    '@import "./tokens.css";',
  ])('rejects %s, which is not the full Preflight-enabling import', (statement) => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: `${statement}
@theme { --color-surface: #f6f7f9; }
`,
      sourceFiles: [{ path: 'main.tsx', source: "import './styles/app.css';\n" }],
    });
    expect(result).toEqual({
      ok: false,
      failures: [
        `styles/app.css @import must be "tailwindcss" with no layer or condition, so Preflight stays on; got ${statement}`,
      ],
    });
  });

  it('rejects @apply', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: `@import "tailwindcss";
@theme { --color-surface: #f6f7f9; }
@layer base {
  .layout { @apply min-h-screen; }
}
`,
      sourceFiles: [{ path: 'main.tsx', source: "import './styles/app.css';\n" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('@apply'))).toBe(true);
  });

  it('rejects class selectors that no source string literal names', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: `${allowedAppCss}
@layer base {
  .skeleton, .panel > .hint:hover { color: #6b7280; }
}
`,
      sourceFiles: [
        { path: 'main.tsx', source: "import './styles/app.css';\n" },
        { path: 'routes/index.tsx', source: '<p className="panel">skeleton hint</p>;\n' },
      ],
    });
    expect(result).toEqual({
      ok: false,
      failures: ['styles/app.css has 2 unused class selector(s): .hint, .skeleton'],
    });
  });

  it('accepts a class selector named in a source string literal', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: `${allowedAppCss}
@layer base {
  .skeleton { color: #6b7280; }
}
`,
      sourceFiles: [
        { path: 'main.tsx', source: "import './styles/app.css';\n" },
        { path: 'shared/LoadingState.tsx', source: "const CLASS = 'h-4 skeleton';\n" },
      ],
    });
    expect(result).toEqual({ ok: true });
  });

  it('counts a class built only by template interpolation as unused', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: `${allowedAppCss}
@layer base {
  .effect-deny { color: #b91c1c; }
}
`,
      sourceFiles: [
        { path: 'main.tsx', source: "import './styles/app.css';\n" },
        { path: 'routes/index.tsx', source: 'const tone = `effect-${effect}`;\n' },
      ],
    });
    expect(result).toEqual({
      ok: false,
      failures: ['styles/app.css has 1 unused class selector(s): .effect-deny'],
    });
  });

  it('rejects a css import outside main.tsx', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: allowedAppCss,
      sourceFiles: [
        { path: 'main.tsx', source: "import './styles/app.css';\n" },
        { path: 'routes/index.tsx', source: "import '../styles/app.css';\n" },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('routes/index.tsx'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { checkCssPolicy } from '../check-css-policy.ts';

const allowedAppCss = `@import "tailwindcss/theme" layer(theme);
@import "tailwindcss/utilities" layer(utilities);

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

  .layout {
    min-height: 100vh;
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
      appCss: `@import "tailwindcss/theme" layer(theme);
@import "tailwindcss/utilities" layer(utilities);
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

  it('rejects a Preflight-enabling Tailwind import', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: `@import "tailwindcss";
@theme { --color-surface: #f6f7f9; }
@layer base {
  :root { color-scheme: light dark; }
}
`,
      sourceFiles: [{ path: 'main.tsx', source: "import './styles/app.css';\n" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('Preflight'))).toBe(true);
  });

  it('rejects @apply', () => {
    const result = checkCssPolicy({
      cssFiles: ['styles/app.css'],
      appCss: `@import "tailwindcss/theme" layer(theme);
@import "tailwindcss/utilities" layer(utilities);
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

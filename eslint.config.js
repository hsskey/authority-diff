import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import n from 'eslint-plugin-n';

const DATE_RANDOM = [
  {
    selector: "NewExpression[callee.name='Date']",
    message: 'lib/domain and lib/app must not use new Date(); depend on the Clock port.',
  },
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message: 'lib/domain and lib/app must not use Date.now(); depend on the Clock port.',
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: 'lib/domain and lib/app must not use Math.random().',
  },
];

const PROCESS_ENV = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'process.env may be read only in the designated config files.',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '.omc/**',
      // Architecture-rule fixtures deliberately violate the boundaries and naming
      // conventions; they are exercised by tests/arch, not linted.
      'tests/arch/fixtures/**',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importX, n },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'import-x/no-default-export': 'error',
      'no-console': 'error',
      'no-restricted-syntax': ['error', PROCESS_ENV],
    },
  },
  {
    files: ['packages/*/lib/domain/**/*.ts', 'packages/*/lib/app/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', PROCESS_ENV, ...DATE_RANDOM],
    },
  },
  // drizzle-orm and postgres confinement moved to the architecture test suite
  // (tests/arch, rule G14 drizzlePostgresConfined) so every import-graph boundary has
  // a single owner. See docs/adr/0010 and docs/acr/0002.
  {
    files: ['apps/cli/src/output.ts', 'tools/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['packages/platform/lib/infra/config.ts', 'apps/cli/src/config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'import-x/no-default-export': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.config.ts', 'scripts/**/*.ts'],
    rules: {
      'import-x/no-default-export': 'off',
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);

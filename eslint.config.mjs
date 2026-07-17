import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const quarantinedPaths = [
  '.bootstrap/**',
  'storage/**',
  'templates/**',
  'workflows/**',
  'test/**',
  'src/database/seeders/**',
  'src/modules/accounting/**',
  'src/modules/advertising/**',
  'src/modules/analytics/**',
  'src/modules/appointments/**',
  'src/modules/audit/**',
  'src/modules/auth/**',
  'src/modules/cms/**',
  'src/modules/content/**',
  'src/modules/files/**',
  'src/modules/homepage/**',
  'src/modules/legacy-compatibility/**',
  'src/modules/messaging/**',
  'src/modules/roles-permissions/**',
  'src/modules/scheduling/**',
  'src/modules/therapy-catalog/**',
  'src/modules/users/**',
];

const separatelyValidatedJavaScript = ['eslint.config.mjs', 'jest.config.cjs', 'scripts/*.cjs'];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'artifacts/**',
      ...quarantinedPaths,
      ...separatelyValidatedJavaScript,
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
);

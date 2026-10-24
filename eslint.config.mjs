import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierCompat from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const sourceFiles = ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'];
const typeScriptFiles = ['**/*.{ts,tsx,mts,cts}'];
const configFiles = ['**/*.{js,mjs,cjs}'];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      '.open-next/**',
      '**/.wrangler/**',
      'next-env.d.ts',
    ],
  },

  { files: sourceFiles, extends: [js.configs.recommended] },

  {
    files: typeScriptFiles,
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  { files: configFiles, extends: [tseslint.configs.disableTypeChecked] },

  {
    files: sourceFiles,
    extends: [
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
      nextPlugin.configs['core-web-vitals'],
    ],
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react/forbid-component-props': ['error', { forbid: ['style'] }],
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  { files: sourceFiles, extends: [prettierCompat] },
);

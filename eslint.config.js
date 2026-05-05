import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import oxlint from 'eslint-plugin-oxlint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const reviewabilityRules = {
  // Keep functions reviewable; file size gets a softer global warning and a higher app-code cap below.
  'max-lines-per-function': ['error', { max: 90, skipBlankLines: true, skipComments: true, IIFEs: true }],
}
const advisoryFileSizeRule = ['warn', { max: 800, skipBlankLines: true, skipComments: true }]
const applicationFileSizeRule = ['error', { max: 1200, skipBlankLines: true, skipComments: true }]
const correctnessRules = {
  curly: ['error', 'all'],
  eqeqeq: ['error', 'smart'],
  'no-console': 'off',
  'no-implicit-coercion': 'error',
  'object-shorthand': ['error', 'always'],
  'prefer-object-has-own': 'error',
  'prefer-template': 'error',
}

export default defineConfig([
  globalIgnores([
    '.worktrees',
    'dist',
    'core/dist',
    'core/node_modules',
    'core/models/nsfwjs',
    'deployments/desktop/tauri/target',
    'deployments/desktop/tauri/gen',
    'deployments/desktop/tauri/binaries',
    'src-tauri/target',
    'src-tauri/gen',
    'src-tauri/binaries',
    'artifacts/**',
    '.local/**',
    '.vscode/**',
    'vite.config.ts.timestamp-*.mjs',
  ]),
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'max-lines': advisoryFileSizeRule,
      ...reviewabilityRules,
      ...correctnessRules,
    },
  },
  {
    files: ['**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      'max-lines': advisoryFileSizeRule,
      ...reviewabilityRules,
      ...correctnessRules,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir,
      },
    },
    rules: {
      'max-lines': advisoryFileSizeRule,
      ...reviewabilityRules,
      ...correctnessRules,
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
        disallowTypeAnnotations: false,
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: true }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/entrypoints/web/**/*.{ts,tsx}'],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'react/jsx-boolean-value': ['error', 'never'],
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      'react/jsx-no-useless-fragment': 'error',
      'react/prefer-read-only-props': 'error',
      'react/prop-types': 'off',
      'react/self-closing-comp': 'error',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'max-lines': applicationFileSizeRule,
    },
  },
  {
    files: [
      'src/boundary/runtime/**/*.{ts,tsx}',
      'src/boundary/contracts/**/*.{ts,tsx}',
      'src/boundary/transport/usePhotoLibrary.transport.ts',
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      'vite.config.ts',
      'tooling/**/*.{js,mjs,cjs,ts}',
      'src/data/**/*.{ts,js}',
      'src/services/**/*.{ts,js}',
      'src/entrypoints/core/**/*.{ts,js}',
      'src/boundary/transport/devBridge*.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...oxlint.buildFromOxlintConfigFile(path.join(rootDir, '.oxlintrc.json')),
])

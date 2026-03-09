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
const sharedDefaultProjectGlobs = ['shared/types/*.ts', 'shared/utils/*.ts']
const reviewabilityRules = {
  // Keep files and functions reviewable for both humans and AI tools.
  'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 90, skipBlankLines: true, skipComments: true, IIFEs: true }],
}
const correctnessRules = {
  curly: ['error', 'all'],
  eqeqeq: ['error', 'smart'],
  'no-console': 'off',
  'no-implicit-coercion': 'error',
  'object-shorthand': ['error', 'always'],
  'prefer-object-has-own': 'error',
}

export default defineConfig([
  globalIgnores([
    'dist',
    'core/dist',
    'src-tauri/target',
    'src-tauri/binaries',
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
        projectService: {
          allowDefaultProject: sharedDefaultProjectGlobs,
        },
        tsconfigRootDir: rootDir,
      },
    },
    rules: {
      ...reviewabilityRules,
      ...correctnessRules,
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
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: {
          allowDefaultProject: sharedDefaultProjectGlobs,
        },
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
      'react/jsx-no-useless-fragment': 'error',
      'react/prop-types': 'off',
      'react/self-closing-comp': 'error',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: [
      'vite.config.ts',
      'scripts/**/*.{js,mjs,cjs,ts}',
      'core/**/*.{ts,js,mjs,cjs}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...oxlint.buildFromOxlintConfigFile(path.join(rootDir, '.oxlintrc.json')),
])

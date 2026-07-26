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
import sonarjs from 'eslint-plugin-sonarjs'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import deslint from '@deslint/eslint-plugin'
import { qualityPolicy } from './tooling/scripts/repo/quality-policy.js'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const reviewabilityRules = {
  // Keep functions reviewable; file size gets a softer global warning and a higher app-code cap below.
  'max-lines-per-function': ['error', {
    max: qualityPolicy.complexity.maxFunctionLines,
    skipBlankLines: true,
    skipComments: true,
    IIFEs: true,
  }],
}
const advisoryFileSizeRule = ['warn', {
  max: qualityPolicy.reviewability.advisoryFileLines,
  skipBlankLines: true,
  skipComments: true,
}]
const applicationFileSizeRule = ['error', {
  max: qualityPolicy.reviewability.applicationFileLines,
  skipBlankLines: true,
  skipComments: true,
}]
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
  globalIgnores(qualityPolicy.lintIgnores),
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  sonarjs.configs.recommended,
  deslint.configs.recommended,
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
      'no-nested-ternary': 'error',
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
      jsxA11y.flatConfigs.recommended,
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
    // Client-only tool contributions live beside their service plug-ins but
    // must be analysed with the web project, never the Node core project.
    files: ['src/services/photoEditing/tools/plugins/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: rootDir,
      },
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
  {
    files: ['tests/**/*', 'vite.config.ts'],
    rules: {
      'sonarjs/pseudo-random': 'off',
      'sonarjs/os-command': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/concise-regex': 'off',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/no-dead-store': 'off',
      'deslint/no-empty-catch': 'off',
      'deslint/no-sql-injection': 'off',
      'deslint/no-hardcoded-secrets': 'off',
      'deslint/no-shell-injection': 'off',
      'deslint/no-prod-console': 'off',
      'max-lines-per-function': 'off',
      'no-unused-vars': 'off',
      'unicorn/prefer-node-protocol': 'off',
    },
  },
  {
    files: [
      'src/**/*',
    ],
    rules: {
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/arguments-order': 'off',
      'sonarjs/different-types-comparison': 'off',
      'sonarjs/use-type-alias': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/redundant-type-aliases': 'off',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/no-dead-store': 'off',
      'sonarjs/no-nested-template-literals': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/prefer-read-only-props': 'off',
      'sonarjs/prefer-regexp-exec': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-redundant-optional': 'off',
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/no-invariant-returns': 'off',
      'sonarjs/todo-tag': 'off',
      'sonarjs/no-misleading-array-reverse': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      'deslint/no-empty-catch': 'off',
      'deslint/responsive-required': 'off',
      'deslint/no-prod-console': 'off',
      'deslint/prefer-semantic-html': 'off',
      'deslint/responsive-image-optimization': 'off',
      'deslint/form-labels': 'off',
      'deslint/no-arbitrary-typography': 'off',
      'deslint/no-arbitrary-spacing': 'off',
      'deslint/no-arbitrary-zindex': 'off',
      'deslint/icon-accessibility': 'off',
      'deslint/consistent-component-spacing': 'off',
      'deslint/safe-external-links': 'off',
      'deslint/no-sql-injection': 'off',
      'deslint/a11y-color-contrast': 'off',
      'deslint/focus-visible-style': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/function-return-type': 'off',
      'no-empty': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/mouse-events-have-key-events': 'off',
      'jsx-a11y/no-autofocus': 'off',
    },
  },
  ...oxlint.buildFromOxlintConfigFile(path.join(rootDir, '.oxlintrc.json')),
])

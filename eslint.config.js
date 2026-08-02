// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = tseslint.config(
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        [
          { type: 'element', prefix: ['ec'], style: 'kebab-case' },
          { type: 'attribute', prefix: ['ec', 'app'], style: 'camelCase' },
        ],
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['ec', 'app'], style: 'kebab-case' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'echarts',
              message:
                "Import runtime code from 'echarts/core' (or a specific 'echarts/charts' / " +
                "'echarts/components' subpath) so the bundle only contains what's registered. " +
                "Type-only imports from 'echarts' are fine.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Common test pattern: `expect(x).toBeDefined()` narrows at runtime, not for TS, so the
      // next line needs `!` to use `x` as non-null.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
);

/** @typedef {import("prettier").Config} PrettierConfig */

/** @type { PrettierConfig } */
const config = {
  endOfLine: 'lf',
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  printWidth: 80,
  plugins: ['@ianvs/prettier-plugin-sort-imports', 'prettier-plugin-pkg'],
  importOrderTypeScriptVersion: '7.0.2',
  importOrder: [
    '^(node:)',
    '',
    '<BUILTIN_MODULES>',
    '',
    '<THIRD_PARTY_MODULES>',
    '',
    '^types$',
    '^~/(.*)$',
    '',
    '^[./]',
  ],
};

export default config;

// ESLint chỉ phục vụ MỘT luật: cấm chuỗi giao diện viết cứng (FR-119, docs/14 §2).
// Mọi lint/format còn lại do Biome đảm nhiệm.
import i18next from 'eslint-plugin-i18next';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { mode: 'jsx-only' }],
    },
  },
];

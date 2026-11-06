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
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          // Thuộc tính KỸ THUẬT (không hiển thị cho người dùng) được miễn; còn lại (placeholder, aria-label, title, alt,
          // văn bản JSX...) vẫn bắt buộc đi qua next-intl.
          'jsx-attributes': {
            exclude: [
              'aria-hidden',
              'aria-current',
              'aria-pressed',
              'aria-busy',
              'variant',
              'tone',
              'name',
              'autoComplete',
              'autoCapitalize',
              'href',
              'icon',
              'active',
              'error',
              'role',
              'lang',
              'value',
              'htmlFor',
              'spellCheck',
              'strokeWidth',
              'className',
              'style',
              'type',
              'key',
              'id',
              'size',
              'width',
              'height',
              'rel',
              'target',
              'tabIndex',
              'aria-describedby',
              'aria-invalid',
              'aria-live',
            ],
          },
        },
      ],
    },
  },
  {
    // Trang mẫu dev gắn "[MẪU]" (chỉ NODE_ENV!==production, QRL1) và khung công khai của chúng: không phải giao diện thật.
    files: ['src/app/dev/**/*.tsx', 'src/components/public/**/*.tsx'],
    rules: { 'i18next/no-literal-string': 'off' },
  },
];

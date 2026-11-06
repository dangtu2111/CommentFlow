import type { Config } from 'tailwindcss';

/**
 * Cấu hình CHÉP NGUYÊN từ script `tailwind-config` trong design/stitch/brand-guideline.html (không tự chế).
 * Trang Tailwind dựng bằng class chép từ HTML Stitch nên tên token (primary, surface, space-md, body-md…) giữ y hệt.
 * Màu/chữ của CSS cũ vẫn ở styles/tokens.css; hai bộ cùng tồn tại (xem docs/decisions/013-tailwind.md).
 *
 * `preflight` tắt để không đổi giao diện các trang cũ; phần reset tối thiểu nằm ở styles/tailwind.css,
 * chỉ có tác dụng bên trong phần tử bọc `.tw`.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  // Class tiện ích chỉ có hiệu lực trong phần tử bọc `.tw` → không đè class cũ trùng tên (.block, .table…).
  important: '.tw',
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        'inverse-primary': '#82d2e7',
        'on-tertiary-fixed-variant': '#6c3a02',
        'surface-variant': '#d7e4f0',
        'surface-container': '#e2f0fb',
        'secondary-fixed': '#e7deff',
        'surface-container-high': '#dceaf5',
        'on-tertiary': '#ffffff',
        'outline-variant': '#bec8cc',
        'surface-container-low': '#eaf5ff',
        'on-surface-variant': '#3f484b',
        'on-error-container': '#93000a',
        'on-error': '#ffffff',
        'surface-container-highest': '#d7e4f0',
        'surface-container-lowest': '#ffffff',
        'on-primary': '#ffffff',
        'on-primary-fixed-variant': '#004e5c',
        'on-primary-fixed': '#001f26',
        'on-secondary': '#ffffff',
        'inverse-surface': '#25323b',
        'error-container': '#ffdad6',
        'on-primary-container': '#bdf0ff',
        'tertiary-fixed-dim': '#ffb779',
        'on-tertiary-container': '#ffe3cf',
        tertiary: '#77440b',
        secondary: '#633cd5',
        'surface-bright': '#f5faff',
        'on-secondary-fixed': '#1f0060',
        'primary-fixed-dim': '#82d2e7',
        'secondary-container': '#7c59ef',
        'on-surface': '#101d25',
        primary: '#005868',
        'primary-container': '#0b7285',
        surface: '#f5faff',
        'on-secondary-fixed-variant': '#4d1ebf',
        'on-background': '#101d25',
        'secondary-fixed-dim': '#ccbdff',
        'on-secondary-container': '#fffbff',
        'tertiary-container': '#945b23',
        background: '#f5faff',
        error: '#ba1a1a',
        'primary-fixed': '#abedff',
        'surface-dim': '#cedce7',
        'inverse-on-surface': '#e5f3fe',
        outline: '#6f797c',
        'surface-tint': '#00687a',
        'on-tertiary-fixed': '#2e1500',
        'tertiary-fixed': '#ffdcc1',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      spacing: {
        'margin-mobile': '1rem',
        'space-xl': '1.5rem',
        margin: '1.5rem',
        gutter: '1rem',
        'gutter-mobile': '0.75rem',
        'space-xs': '0.25rem',
        'space-lg': '1rem',
        'space-sm': '0.5rem',
        'space-md': '0.75rem',
      },
      // Tên cỡ chữ của Stitch (font-body-md text-body-md…): mọi họ chữ đều là Be Vietnam Pro
      // (tự lưu cục bộ qua @fontsource, nạp ở app/layout.tsx; CSP font-src 'self').
      fontFamily: Object.fromEntries(
        [
          'title-sm',
          'body-sm',
          'headline-lg-mobile',
          'headline-md',
          'label-sm',
          'title-md',
          'code-sm',
          'headline-lg',
          'body-md',
          'label-md',
          'headline-sm',
          'body-lg',
        ].map((name) => [name, ['Be Vietnam Pro', 'system-ui', 'sans-serif']]),
      ),
      fontSize: {
        'title-sm': ['13px', { lineHeight: '18px', fontWeight: '600' }],
        'body-sm': ['12px', { lineHeight: '16px', fontWeight: '400' }],
        'headline-lg-mobile': [
          '24px',
          { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '700' },
        ],
        'headline-md': [
          '22px',
          { lineHeight: '28px', letterSpacing: '-0.015em', fontWeight: '600' },
        ],
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '600' }],
        'title-md': ['15px', { lineHeight: '20px', fontWeight: '600' }],
        'code-sm': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'headline-lg': [
          '30px',
          { lineHeight: '38px', letterSpacing: '-0.02em', fontWeight: '700' },
        ],
        'body-md': ['13px', { lineHeight: '19px', fontWeight: '400' }],
        'label-md': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'headline-sm': [
          '18px',
          { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        'body-lg': ['15px', { lineHeight: '22px', fontWeight: '400' }],
      },
    },
  },
};

export default config;

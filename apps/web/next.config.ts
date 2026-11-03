import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { loadRepoEnv } from '../../scripts/lib/load-env.mjs';

// Next chỉ đọc .env trong apps/web; nạp .env.local rồi .env ở gốc repo (xem scripts/lib/load-env.mjs).
loadRepoEnv(new URL('../../', import.meta.url));

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig: NextConfig = {
  // Gói nội bộ được dùng thẳng từ mã nguồn TypeScript (không build riêng).
  transpilePackages: ['@flow/shared', '@flow/saas-core', '@flow/db'],
  // Thư viện Node chạy phía server, không đóng gói vào bundle.
  serverExternalPackages: ['nodemailer', 'pg'],
  // Bản chạy độc lập cho Docker (cf-staging); cần gốc monorepo để gom đúng gói nội bộ.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  poweredByHeader: false,
  // Next 16 tự sinh AGENTS.md trong apps/web; hướng dẫn cho agent của repo nằm ở AGENTS.md gốc.
  agentRules: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Trang nhận token trong URL: không gửi Referer đi nơi khác, không cache.
      {
        source: '/reset-password',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      { source: '/verify-email', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default withNextIntl(nextConfig);

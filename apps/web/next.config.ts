import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Gói nội bộ được dùng thẳng từ mã nguồn TypeScript (không build riêng).
  transpilePackages: ['@flow/shared'],
  // Bản chạy độc lập cho Docker (cf-staging); cần gốc monorepo để gom đúng gói nội bộ.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);

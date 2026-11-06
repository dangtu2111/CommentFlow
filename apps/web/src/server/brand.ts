import { type BrandConfig, loadBrandConfig } from '@flow/shared';

/**
 * Thương hiệu cho giao diện (FR-125): đọc `APP_NAME`, `APP_LOGO_URL`, `APP_DOMAIN`, `APP_EMAIL_FROM` một lần cho cả
 * tiến trình. Không đòi các biến khác (DB, SMTP…) nên dùng được ở mọi trang. Cấu hình sai → ném `CONFIG_INVALID`
 * (nêu tên biến, không nêu giá trị).
 */
let cached: BrandConfig | undefined;

export function getBrand(): BrandConfig {
  cached ??= loadBrandConfig();
  return cached;
}

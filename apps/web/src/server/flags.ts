import { createFlags, type Flags } from '@flow/saas-core';
import { FLAG_DEFAULTS } from '@flow/shared';
import { getDb } from './db';

/**
 * Feature flag của web (docs/09 §10): đọc từ DB, nhớ 30 giây (đổi cờ có hiệu lực trong ≤ 30 giây; kill switch dùng được trong 1 phút). Tạo LƯỜI
 * (next build không có DATABASE_URL). Không đọc được DB → dùng mặc định trong mã (cờ AI mặc định TẮT). Ghi cờ: `pnpm flags:set` (dev/test/ci);
 * staging/production qua trang Admin (gap ADMIN-FLAGS-PAGE).
 */
let flags: Flags | undefined;

export function getFlags(): Flags {
  flags ??= createFlags({
    db: getDb(),
    defaults: { ...FLAG_DEFAULTS },
    onReadError: (error) =>
      console.error(
        JSON.stringify({
          event: 'flags_read_failed',
          reason: error instanceof Error ? error.name : 'unknown',
        }),
      ),
  });
  return flags;
}

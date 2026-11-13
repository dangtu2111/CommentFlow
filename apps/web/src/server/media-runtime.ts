import { createMediaStoreFromEnv, type MediaStore } from '@flow/storage';

let cached: ReturnType<typeof createMediaStoreFromEnv> | undefined;

/** Kho ảnh/video THẬT (S3 qua `MEDIA_S3_*`). Dựng lười một lần; thiếu cấu hình → `{ ok: false, missing }` (tính năng tắt kèm lý do, không bản giả). */
export function mediaStore(): ReturnType<typeof createMediaStoreFromEnv> {
  cached ??= createMediaStoreFromEnv(process.env);
  return cached;
}

/** Tính năng tải ảnh/video có dùng được không (chỉ để giao diện bật/tắt nút). */
export const mediaEnabled = (): boolean => mediaStore().ok;

export type { MediaStore };

import { createHash } from 'node:crypto';

/**
 * Ảnh đại diện: chỉ JPG/PNG ≤ 2MB, kiểm cả CHỮ KÝ BYTE (không tin `Content-Type` do client khai). Lưu qua interface
 * `AvatarStore`; hiện chỉ có bản MOCK (không gọi dịch vụ lưu trữ thật) — cờ `NEXT_PUBLIC_AVATAR_UPLOAD_ENABLED` mặc định TẮT.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export type AvatarExt = 'png' | 'jpg';
export type AvatarCheck =
  | { ok: true; ext: AvatarExt }
  | { ok: false; reason: 'empty' | 'too_large' | 'type' };

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);

export function validateAvatar(bytes: Uint8Array, declaredType: string): AvatarCheck {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > AVATAR_MAX_BYTES) return { ok: false, reason: 'too_large' };
  const isPng = startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const isJpg = startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (isPng && declaredType === 'image/png') return { ok: true, ext: 'png' };
  if (isJpg && declaredType === 'image/jpeg') return { ok: true, ext: 'jpg' };
  return { ok: false, reason: 'type' };
}

export interface AvatarStore {
  /** Lưu ảnh và trả đường dẫn để ghi `users.image`. */
  put(input: { userId: string; bytes: Uint8Array; ext: AvatarExt }): Promise<string>;
  remove(input: { userId: string; url: string }): Promise<void>;
}

/** MOCK: không lưu gì, chỉ trả đường dẫn cục bộ ổn định theo nội dung. Bản thật (S3/R2…) ghi ở `docs/can-ban-cung-cap.d/`. */
export function createMockAvatarStore(): AvatarStore {
  return {
    async put({ userId, bytes, ext }) {
      const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
      return `/avatars/mock/${userId}/${digest}.${ext}`;
    },
    async remove() {
      return undefined;
    },
  };
}

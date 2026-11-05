import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { deriveKey } from './signed-value';

/**
 * Giá trị chuỗi NIÊM PHONG (AES-256-GCM, có hạn) cho cookie chứa bí mật ngắn hạn (vd token người dùng giữa hai bước
 * OAuth). Khác `createSignedValueCodec` (chỉ ký, nội dung đọc được): ở đây nội dung bị mã hóa + xác thực.
 * Khóa con HKDF từ secret theo NHÃN riêng; nhãn cũng là AAD nên cookie của mục đích khác không mở được.
 * Hỏng/sai khóa/sai nhãn/hết hạn → `null` (không phân biệt, không lộ lý do).
 */
export type SealedValueCodec = {
  seal(value: string): string;
  open(token: string | undefined): string | null;
};

const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_TOKEN_LENGTH = 3800; // vừa một cookie (≤ 4096 byte kể cả tên/thuộc tính)

export function createSealedValueCodec(options: {
  secret: string;
  label: string;
  ttlSeconds: number;
  now?: () => number;
}): SealedValueCodec {
  const key = deriveKey(options.secret, options.label);
  const aad = Buffer.from(`sealed/${options.label}`);
  const now = options.now ?? Date.now;

  return {
    seal(value) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(aad);
      const plain = JSON.stringify({ v: value, x: Math.floor(now() / 1000) + options.ttlSeconds });
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const token = Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
      if (token.length > MAX_TOKEN_LENGTH) throw new Error('sealed value: quá dài cho một cookie.');
      return token;
    },
    open(token) {
      if (!token || token.length > MAX_TOKEN_LENGTH) return null;
      try {
        const raw = Buffer.from(token, 'base64url');
        if (raw.length <= IV_BYTES + TAG_BYTES) return null;
        const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
        decipher.setAAD(aad);
        decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
        const plain = Buffer.concat([
          decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
          decipher.final(),
        ]).toString('utf8');
        const data = JSON.parse(plain) as { v?: unknown; x?: unknown };
        if (typeof data.v !== 'string' || typeof data.x !== 'number') return null;
        return data.x * 1000 > now() ? data.v : null;
      } catch {
        return null;
      }
    },
  };
}

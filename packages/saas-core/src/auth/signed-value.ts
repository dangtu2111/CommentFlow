import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/**
 * Khóa con dẫn xuất từ `BETTER_AUTH_SECRET` bằng HKDF-SHA256 với NHÃN riêng cho từng mục đích (docs/13 §5):
 * lộ/đổi một khóa con không ảnh hưởng mục đích khác, và không bao giờ dùng secret gốc trực tiếp để ký.
 */
export function deriveKey(secret: string, label: string): Buffer {
  if (!secret) throw new Error('deriveKey: secret rỗng.');
  if (!label) throw new Error('deriveKey: thiếu nhãn.');
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), `commentflow/${label}`, 32));
}

/** Giá trị chuỗi ký HMAC có hạn (cookie của server). Chuỗi không được chứa dấu chấm đầu/cuối đặc biệt — dùng base64url. */
export type SignedValueCodec = {
  sign(value: string): string;
  /** @returns giá trị gốc nếu chữ ký đúng và chưa hết hạn; ngược lại null. */
  verify(token: string | undefined): string | null;
};

export function createSignedValueCodec(options: {
  secret: string;
  /** Nhãn HKDF, ví dụ `workspace-cookie/v1`. */
  label: string;
  ttlSeconds: number;
  now?: () => number;
}): SignedValueCodec {
  const key = deriveKey(options.secret, options.label);
  const now = options.now ?? Date.now;
  const mac = (payload: string): string =>
    createHmac('sha256', key).update(payload).digest('base64url');

  return {
    sign(value) {
      const expiresAt = Math.floor(now() / 1000) + options.ttlSeconds;
      const payload = Buffer.from(JSON.stringify({ v: value, x: expiresAt })).toString('base64url');
      return `${payload}.${mac(payload)}`;
    },
    verify(token) {
      if (!token || token.length > 1024) return null;
      const dot = token.lastIndexOf('.');
      if (dot < 1) return null;
      const payload = token.slice(0, dot);
      const given = Buffer.from(token.slice(dot + 1));
      const expected = Buffer.from(mac(payload));
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
          v?: unknown;
          x?: unknown;
        };
        if (typeof data.v !== 'string' || typeof data.x !== 'number') return null;
        return data.x * 1000 > now() ? data.v : null;
      } catch {
        return null;
      }
    },
  };
}

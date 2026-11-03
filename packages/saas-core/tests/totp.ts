import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Giải mã base32 (RFC 4648, không đệm) — định dạng secret trong URI `otpauth://`. */
export function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('base32 không hợp lệ');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Mã TOTP chuẩn RFC 6238 (HMAC-SHA1, 30 giây, 6 chữ số) — để test đóng vai ứng dụng xác thực. */
export function totp(
  secretBase32: string,
  at: number = Date.now(),
  period = 30,
  digits = 6,
): string {
  const counter = Math.floor(at / 1000 / period);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(message).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    ((hmac[offset + 1] ?? 0) << 16) |
    ((hmac[offset + 2] ?? 0) << 8) |
    (hmac[offset + 3] ?? 0);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Lấy secret từ URI `otpauth://totp/...?secret=...`. */
export function secretFromUri(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new Error('URI không có secret');
  return secret;
}

/** Mã sai chắc chắn (khác mã đúng hiện tại và 2 cửa sổ kề bên). */
export function wrongCode(secretBase32: string): string {
  const valid = new Set([-1, 0, 1].map((step) => totp(secretBase32, Date.now() + step * 30_000)));
  for (let n = 0; n < 1000; n++) {
    const candidate = String(n * 997)
      .padStart(6, '0')
      .slice(-6);
    if (!valid.has(candidate)) return candidate;
  }
  throw new Error('không tạo được mã sai');
}

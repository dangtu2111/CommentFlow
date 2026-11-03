import { randomBytes, timingSafeEqual } from 'node:crypto';
import { argon2idAsync } from '@noble/hashes/argon2.js';

// Tham số tối thiểu theo khuyến nghị OWASP cho argon2id: 19 MiB bộ nhớ, 2 vòng, 1 luồng.
const MEMORY_KIB = 19456;
const ITERATIONS = 2;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64').replace(/=+$/, '');

/** NFKC: "ế" dựng sẵn và "ế" tổ hợp dấu cho cùng một mật khẩu. */
const passwordBytes = (password: string): Uint8Array => encoder.encode(password.normalize('NFKC'));

/** Băm mật khẩu bằng argon2id; kết quả ở dạng chuỗi PHC chứa cả tham số và muối. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await argon2idAsync(passwordBytes(password), salt, {
    t: ITERATIONS,
    m: MEMORY_KIB,
    p: PARALLELISM,
    dkLen: HASH_BYTES,
  });
  return `$argon2id$v=19$m=${MEMORY_KIB},t=${ITERATIONS},p=${PARALLELISM}$${b64(salt)}$${b64(hash)}`;
}

const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** So khớp mật khẩu với chuỗi băm. Chuỗi hỏng/lạ → false (không ném lỗi, không lộ lý do). */
export async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  const match = PHC_PATTERN.exec(input.hash);
  if (!match) return false;
  const [, m, t, p, saltB64, hashB64] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = Buffer.from(hashB64, 'base64');
  if (expected.length === 0) return false;
  const actual = await argon2idAsync(
    passwordBytes(input.password),
    Buffer.from(saltB64, 'base64'),
    { t: Number(t), m: Number(m), p: Number(p), dkLen: expected.length },
  );
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), expected);
}

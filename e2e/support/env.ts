import { randomBytes } from 'node:crypto';

/** Biến môi trường E2E (do scripts/e2e.mjs đặt, hoặc đặt tay khi chạy `playwright test` trực tiếp). Không in giá trị. */
export function requireEnv(name: 'E2E_BASE_URL' | 'E2E_NOAI_BASE_URL' | 'MAILPIT_URL'): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}. Chạy bằng \`pnpm e2e\` ở gốc repo.`);
  return value;
}

export type TestUser = { name: string; email: string; password: string };

/** Mã ngắn ngẫu nhiên cho một lần chạy: email/tên workspace không trùng lần chạy trước. */
export function runTag(): string {
  return randomBytes(5).toString('hex');
}

/** Người dùng thử: email ở miền `example.test` (không bao giờ gửi ra ngoài; Mailpit giữ lại). */
export function newTestUser(tag: string, kind: 'owner' | 'staff'): TestUser {
  return {
    name: `E2E ${kind === 'owner' ? 'Owner' : 'Staff'} ${tag}`,
    email: `e2e-${kind}-${tag}@example.test`,
    // Đủ dài (≥ 10), ngẫu nhiên nên không nằm trong danh sách mật khẩu phổ biến.
    password: `Pw-${randomBytes(9).toString('base64url')}-9`,
  };
}

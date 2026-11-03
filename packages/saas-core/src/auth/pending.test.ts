import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signPending, verifyPending } from './pending';

const SECRET = randomBytes(32).toString('hex');

describe('cookie ký "đang chờ 2FA"', () => {
  it('ký rồi kiểm lại ra đúng email', () => {
    expect(verifyPending(SECRET, signPending(SECRET, 'a@example.test'))).toBe('a@example.test');
  });

  it('hết hạn (mặc định 10 phút) → null', () => {
    let now = 1_000_000_000_000;
    const token = signPending(SECRET, 'a@example.test', { now: () => now });
    expect(verifyPending(SECRET, token, () => now + 599_000)).toBe('a@example.test');
    expect(verifyPending(SECRET, token, () => now + 601_000)).toBeNull();
    now += 1;
  });

  it('khóa ký khác → null', () => {
    expect(verifyPending('khoa-khac', signPending(SECRET, 'a@example.test'))).toBeNull();
  });

  it('sửa email trong payload (giữ chữ ký cũ) hoặc sửa chữ ký → null: client không giả email của người khác để né giới hạn', () => {
    const token = signPending(SECRET, 'a@example.test');
    const [payload, signature] = token.split('.') as [string, string];
    const forged = Buffer.from(
      JSON.stringify({ e: 'nan.nhan@example.test', x: 9_999_999_999 }),
    ).toString('base64url');
    expect(verifyPending(SECRET, `${forged}.${signature}`)).toBeNull();
    expect(verifyPending(SECRET, `${payload}.${signature.slice(0, -2)}xx`)).toBeNull();
    expect(verifyPending(SECRET, `${payload}.`)).toBeNull();
  });

  it('chuỗi rác, rỗng, quá dài, thiếu dấu chấm → null (không ném lỗi)', () => {
    for (const bad of [undefined, '', 'abc', '.', 'a.b', 'x'.repeat(2000), '!!!.???']) {
      expect(verifyPending(SECRET, bad as string | undefined), String(bad)).toBeNull();
    }
  });

  it('chữ ký của hành động khác (miền khác) không dùng được — ví dụ HMAC không có tiền tố miền', async () => {
    const { createHmac } = await import('node:crypto');
    const payload = Buffer.from(JSON.stringify({ e: 'a@example.test', x: 9_999_999_999 })).toString(
      'base64url',
    );
    const raw = createHmac('sha256', SECRET).update(payload).digest('base64url');
    expect(verifyPending(SECRET, `${payload}.${raw}`)).toBeNull();
  });
});

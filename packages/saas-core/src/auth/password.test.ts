import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('hashPassword / verifyPassword (argon2id)', () => {
  it('băm ra chuỗi PHC argon2id với tham số OWASP (m=19456, t=2, p=1)', async () => {
    const hash = await hashPassword('mat-khau-dai-du-10');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(hash).not.toContain('mat-khau-dai-du-10');
  });

  it('đúng mật khẩu → true, sai → false', async () => {
    const hash = await hashPassword('mat-khau-dai-du-10');
    expect(await verifyPassword({ hash, password: 'mat-khau-dai-du-10' })).toBe(true);
    expect(await verifyPassword({ hash, password: 'mat-khau-dai-du-11' })).toBe(false);
    expect(await verifyPassword({ hash, password: '' })).toBe(false);
  });

  it('cùng mật khẩu băm hai lần cho kết quả khác nhau (muối ngẫu nhiên)', async () => {
    const a = await hashPassword('mat-khau-dai-du-10');
    const b = await hashPassword('mat-khau-dai-du-10');
    expect(a).not.toBe(b);
  });

  it('chuỗi băm hỏng/không phải argon2id → false, không ném lỗi', async () => {
    for (const hash of [
      '',
      'abc',
      '$argon2i$v=19$m=1,t=1,p=1$YQ$YQ',
      '$argon2id$v=19$m=x,t=2,p=1$YQ$YQ',
      '$argon2id$v=19$m=19456,t=2,p=1$YQ',
    ]) {
      expect(await verifyPassword({ hash, password: 'bất kỳ' })).toBe(false);
    }
  });

  it('mật khẩu tiếng Việt: dạng dựng sẵn và dạng tổ hợp dấu coi là một (NFKC)', async () => {
    const composed = 'Mật khẩu Việt Nam ếế';
    const decomposed = composed.normalize('NFD');
    const hash = await hashPassword(composed);
    expect(await verifyPassword({ hash, password: decomposed })).toBe(true);
  });

  it('verify dùng tham số lưu trong chuỗi băm (hỗ trợ nâng tham số về sau)', async () => {
    const hash = await hashPassword('mat-khau-dai-du-10');
    // Sửa m trong chuỗi → kết quả băm khác → không khớp (chứng tỏ tham số được đọc từ chuỗi)
    const tampered = hash.replace('m=19456', 'm=8192');
    expect(await verifyPassword({ hash: tampered, password: 'mat-khau-dai-du-10' })).toBe(false);
  });
});

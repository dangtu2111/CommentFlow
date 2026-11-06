import { symmetricEncrypt } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import { BACKUP_CODES_TOTAL, countRemainingBackupCodes } from './backup-codes';

const SECRET = 'test-secret-test-secret-test-secret';

describe('countRemainingBackupCodes', () => {
  it('đếm mã chưa dùng trong cột mã hóa, không trả mã ra', async () => {
    const stored = await symmetricEncrypt({
      key: SECRET,
      data: JSON.stringify(['aaaaa-aaaaa', 'bbbbb-bbbbb', 'ccccc-ccccc']),
    });
    expect(await countRemainingBackupCodes(SECRET, stored)).toBe(3);
  });

  it('đã dùng hết → 0', async () => {
    const stored = await symmetricEncrypt({ key: SECRET, data: '[]' });
    expect(await countRemainingBackupCodes(SECRET, stored)).toBe(0);
  });

  it.each([null, undefined, '', 'không-phải-bản-mã'])('dữ liệu hỏng (%j) → 0, không ném lỗi', async (bad) => {
    expect(await countRemainingBackupCodes(SECRET, bad)).toBe(0);
  });

  it('sai khóa → 0', async () => {
    const stored = await symmetricEncrypt({ key: SECRET, data: '["x"]' });
    expect(await countRemainingBackupCodes('khoa-khac-khoa-khac-khoa-khac-xx', stored)).toBe(0);
  });

  it('tổng số mã cấp = 10 (khớp cấu hình plugin)', () => {
    expect(BACKUP_CODES_TOTAL).toBe(10);
  });
});

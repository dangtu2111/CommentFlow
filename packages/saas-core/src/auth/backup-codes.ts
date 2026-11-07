import { symmetricDecrypt } from 'better-auth/crypto';

/** Số mã dự phòng plugin 2FA cấp mỗi lần (`backupCodeOptions.amount` ở `auth.ts`). */
export const BACKUP_CODES_TOTAL = 10;

/**
 * Số mã dự phòng CHƯA dùng. Plugin lưu cột `two_factors.backup_codes` dạng mã hóa của mảng JSON và bỏ mã đã dùng khỏi
 * mảng; ta chỉ giải mã trong bộ nhớ để đếm — không bao giờ trả/ghi mã. Dữ liệu hỏng/sai khóa → 0 (an toàn: giao diện
 * nhắc tạo lại mã), không ném lỗi làm hỏng trang.
 */
export async function countRemainingBackupCodes(
  secret: string,
  stored: string | null | undefined,
): Promise<number> {
  if (!stored) return 0;
  try {
    const plain = await symmetricDecrypt({ key: secret, data: stored });
    const parsed: unknown = JSON.parse(plain);
    return Array.isArray(parsed) ? Math.min(parsed.length, BACKUP_CODES_TOTAL) : 0;
  } catch {
    return 0;
  }
}

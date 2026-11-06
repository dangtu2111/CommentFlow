/**
 * Cờ tính năng hồ sơ (mặc định TẮT; chỉ đúng chữ `true` mới bật — cùng quy ước `QR_PAYMENT_ENABLED`, `DATA_EXPORT_ENABLED`).
 * - `PHONE_VERIFY_ENABLED`: xác minh SĐT bằng OTP. Chưa có nhà cung cấp SMS thật nên chỉ bật được ở APP_ENV dev/test/ci
 *   (SMS MOCK); staging/production luôn TẮT dù cờ bật.
 * - `NEXT_PUBLIC_AVATAR_UPLOAD_ENABLED`: tải ảnh đại diện (lưu qua `AvatarStore` MOCK).
 */
type Source = Record<string, string | undefined>;

const MOCK_ENVS = ['dev', 'test', 'ci'];

export function resolvePhoneVerify(source: Source = process.env): { enabled: boolean } {
  const flag = source.PHONE_VERIFY_ENABLED?.trim() === 'true';
  return { enabled: flag && MOCK_ENVS.includes(source.APP_ENV ?? '') };
}

export const isAvatarUploadEnabled = (source: Source = process.env): boolean =>
  source.NEXT_PUBLIC_AVATAR_UPLOAD_ENABLED?.trim() === 'true';

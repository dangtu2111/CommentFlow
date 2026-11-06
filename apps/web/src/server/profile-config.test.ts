import { describe, expect, it } from 'vitest';
import { isAvatarUploadEnabled, resolvePhoneVerify } from './profile-config';

describe('cờ hồ sơ (mặc định TẮT)', () => {
  it('xác minh SĐT: chỉ đúng chữ "true" mới bật, và chỉ ở dev/test/ci (chưa có nhà cung cấp SMS thật)', () => {
    expect(resolvePhoneVerify({ APP_ENV: 'dev' }).enabled).toBe(false);
    expect(resolvePhoneVerify({ APP_ENV: 'dev', PHONE_VERIFY_ENABLED: 'TRUE' }).enabled).toBe(
      false,
    );
    expect(resolvePhoneVerify({ APP_ENV: 'dev', PHONE_VERIFY_ENABLED: '1' }).enabled).toBe(false);
    expect(resolvePhoneVerify({ APP_ENV: 'dev', PHONE_VERIFY_ENABLED: ' true ' }).enabled).toBe(
      true,
    );
    expect(resolvePhoneVerify({ APP_ENV: 'ci', PHONE_VERIFY_ENABLED: 'true' }).enabled).toBe(true);
    expect(resolvePhoneVerify({ APP_ENV: 'test', PHONE_VERIFY_ENABLED: 'true' }).enabled).toBe(
      true,
    );
  });

  it.each(['staging', 'production'])('%s: cờ bật vẫn TẮT vì không có SMS thật', (APP_ENV) => {
    expect(resolvePhoneVerify({ APP_ENV, PHONE_VERIFY_ENABLED: 'true' }).enabled).toBe(false);
  });

  it('ảnh đại diện: chỉ "true" mới bật', () => {
    expect(isAvatarUploadEnabled({})).toBe(false);
    expect(isAvatarUploadEnabled({ NEXT_PUBLIC_AVATAR_UPLOAD_ENABLED: '1' })).toBe(false);
    expect(isAvatarUploadEnabled({ NEXT_PUBLIC_AVATAR_UPLOAD_ENABLED: 'true' })).toBe(true);
  });
});

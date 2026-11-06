'use server';

import type { StartPhoneVerifyResult, VerifyPhoneResult } from '@flow/saas-core';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { AVATAR_MAX_BYTES, createMockAvatarStore, validateAvatar } from '../../../../lib/avatar';
import { type ProfileState, parseProfileForm } from '../../../../lib/profile-form';
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from '../../../../lib/theme';
import { getAuthRuntime } from '../../../../server/auth';
import { isAvatarUploadEnabled } from '../../../../server/profile-config';
import { requireAppUser } from '../../../../server/require-app-user';
import { recordSecurityEvent } from '../../../../server/security-audit';

/**
 * Server Action hồ sơ của CHÍNH người dùng (Cài đặt › Tài khoản). Mọi hàm gọi `requireAppUser` đầu tiên và lấy userId từ
 * phiên — không nhận userId/email/vai trò từ client. Không bao giờ log giá trị (tên/SĐT) — nhật ký chỉ ghi tên trường.
 */

const SETTINGS_PATH = '/app/settings';
const avatarStore = createMockAvatarStore();

export async function saveProfileAction(
  _previous: ProfileState,
  data: FormData,
): Promise<ProfileState> {
  const { user, workspace } = await requireAppUser({});
  const parsed = parseProfileForm(data);
  if (!parsed.ok) return { status: 'invalid', errors: parsed.errors };
  const runtime = getAuthRuntime();
  try {
    const current = await runtime.profileStore.readProfile(user.id);
    await runtime.tenancy.setUserProfile(user.id, parsed.value);
    const fields = [
      ...(parsed.value.name !== user.name ? ['name'] : []),
      ...(parsed.value.timezone !== current?.timezone ? ['timezone'] : []),
    ];
    if (fields.length > 0) {
      await recordSecurityEvent('profile_updated', {
        workspaceId: workspace.id,
        userId: user.id,
        detail: { fields },
      });
    }
  } catch {
    console.warn(JSON.stringify({ event: 'profile_save_failed' }));
    return { status: 'error' };
  }
  revalidatePath(SETTINGS_PATH);
  return { status: 'saved' };
}

/** Sáng / Tối / Theo hệ thống: lưu `users.theme` + cookie `cf-theme` (nguồn cho lần tải đầu). */
export async function setThemeAction(data: FormData): Promise<void> {
  const { user } = await requireAppUser({});
  const value = data.get('theme');
  if (value !== 'light' && value !== 'dark' && value !== 'system') return;
  await getAuthRuntime().tenancy.setUserProfile(user.id, { theme: value });
  (await cookies()).set(THEME_COOKIE, value, {
    path: '/',
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: 'lax',
    // Script chống nháy đọc cookie này ở phía trình duyệt nên KHÔNG httpOnly; chỉ chứa light/dark/system.
    httpOnly: false,
    secure: getAuthRuntime().secureCookies,
  });
  revalidatePath(SETTINGS_PATH);
}

export type AvatarState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'removed' }
  | { status: 'error'; reason: 'disabled' | 'empty' | 'too_large' | 'type' | 'failed' };

export async function uploadAvatarAction(
  _previous: AvatarState,
  data: FormData,
): Promise<AvatarState> {
  const { user, workspace } = await requireAppUser({});
  if (!isAvatarUploadEnabled()) return { status: 'error', reason: 'disabled' };
  const file = data.get('avatar');
  if (!(file instanceof File)) return { status: 'error', reason: 'empty' };
  // Chặn sớm theo kích thước khai báo, trước khi đọc nội dung vào bộ nhớ.
  if (file.size > AVATAR_MAX_BYTES) return { status: 'error', reason: 'too_large' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateAvatar(bytes, file.type);
  if (!checked.ok) return { status: 'error', reason: checked.reason };
  try {
    const url = await avatarStore.put({ userId: user.id, bytes, ext: checked.ext });
    await getAuthRuntime().tenancy.setUserImage(user.id, url);
    await recordSecurityEvent('avatar_changed', { workspaceId: workspace.id, userId: user.id });
  } catch {
    return { status: 'error', reason: 'failed' };
  }
  revalidatePath(SETTINGS_PATH);
  return { status: 'saved' };
}

export async function removeAvatarAction(
  _previous: AvatarState,
  _data: FormData,
): Promise<AvatarState> {
  const { user, workspace } = await requireAppUser({});
  if (!isAvatarUploadEnabled()) return { status: 'error', reason: 'disabled' };
  try {
    await getAuthRuntime().tenancy.setUserImage(user.id, null);
    await recordSecurityEvent('avatar_removed', { workspaceId: workspace.id, userId: user.id });
  } catch {
    return { status: 'error', reason: 'failed' };
  }
  revalidatePath(SETTINGS_PATH);
  return { status: 'removed' };
}

/** Bước 1 của hộp thoại xác minh SĐT: gửi OTP (MOCK). Tham số do client gửi → chỉ nhận chuỗi ngắn. */
export async function startPhoneVerifyAction(phoneInput: string): Promise<StartPhoneVerifyResult> {
  const { user, workspace } = await requireAppUser({});
  if (typeof phoneInput !== 'string' || phoneInput.length > 32) return { status: 'invalid_phone' };
  const result = await getAuthRuntime().phoneVerify.start({ userId: user.id, phoneInput });
  if (result.status === 'sent') {
    await recordSecurityEvent('phone_otp_sent', { workspaceId: workspace.id, userId: user.id });
  }
  return result;
}

/** Bước 2: nhập OTP. Thành công → `users.phone`/`phone_verified_at` được ghi, trang dựng lại với SĐT đã che. */
export async function verifyPhoneAction(code: string): Promise<VerifyPhoneResult> {
  const { user, workspace } = await requireAppUser({});
  if (typeof code !== 'string' || code.length > 16) return { status: 'invalid' };
  const result = await getAuthRuntime().phoneVerify.verify({ userId: user.id, code });
  if (result.status === 'verified') {
    await recordSecurityEvent('phone_verified', { workspaceId: workspace.id, userId: user.id });
    revalidatePath(SETTINGS_PATH);
  }
  return result;
}

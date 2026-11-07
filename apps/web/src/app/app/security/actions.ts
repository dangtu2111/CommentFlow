'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { applyCookies } from '../../../lib/apply-cookies';
import { changePasswordToState, parseChangePasswordForm } from '../../../lib/change-password-form';
import {
  parseSecurityInput,
  reauthFailureToState,
  SECURITY_IDLE,
  type SecurityState,
  securityError,
} from '../../../lib/security-form';
import { getAuthRuntime } from '../../../server/auth';
import { requestContext } from '../../../server/request-context';
import { requireAppUser } from '../../../server/require-app-user';
import { recordSecurityEvent } from '../../../server/security-audit';

/**
 * Server Action của trang bảo mật. Mỗi hàm đọc phiên từ cookie (phía server) — không nhận userId từ form —
 * và đổi kết quả của saas-core thành trạng thái cho giao diện. Chưa đăng nhập → về /login.
 */

/** Trang bảo mật: Owner/Admin chưa bật 2FA vẫn phải vào được để bật; không cần workspace. */
const SECURITY_ACCESS = { workspace: 'optional', twoFactor: 'skip' } as const;

const flows = () => getAuthRuntime().twoFactor;

/** Bước 1: nhập mật khẩu → QR + khóa nhập tay + mã dự phòng (chưa bật cho đến khi xác nhận mã đầu tiên). */
export async function beginTwoFactorAction(
  _previous: SecurityState,
  data: FormData,
): Promise<SecurityState> {
  await requireAppUser(SECURITY_ACCESS);
  const password = parseSecurityInput('password', data);
  if (!password.ok) return password.state;
  const result = await flows().beginEnrollment({
    password: password.value,
    headers: (await requestContext()).headers,
  });
  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status !== 'ok') return reauthFailureToState(result);
  return {
    status: 'enroll',
    qrDataUrl: result.qrDataUrl,
    manualKey: result.manualKey,
    backupCodes: result.backupCodes,
  };
}

/** Bước 2: mã 6 chữ số đầu tiên → 2FA bật. Trang dựng lại sau khi đặt cookie phải đọc phiên MỚI (qua `requestContext()` → cookie-header.ts), nếu không sẽ về /login và mất mã dự phòng. */
export async function confirmTwoFactorAction(
  _previous: SecurityState,
  data: FormData,
): Promise<SecurityState> {
  const { user, workspace } = await requireAppUser(SECURITY_ACCESS);
  const code = parseSecurityInput('code', data);
  if (!code.ok) return code.state;
  const result = await flows().confirmEnrollment({
    code: code.value,
    headers: (await requestContext()).headers,
  });
  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status !== 'ok') return reauthFailureToState(result);
  applyCookies(await cookies(), result.cookies); // plugin xoay phiên khi bật 2FA
  await recordSecurityEvent('two_factor_enabled', {
    workspaceId: workspace?.id ?? null,
    userId: user.id,
  });
  return { status: 'done' };
}

export async function regenerateBackupCodesAction(
  _previous: SecurityState,
  data: FormData,
): Promise<SecurityState> {
  const { user, workspace } = await requireAppUser(SECURITY_ACCESS);
  const password = parseSecurityInput('password', data);
  if (!password.ok) return password.state;
  const result = await flows().regenerateBackupCodes({
    password: password.value,
    headers: (await requestContext()).headers,
  });
  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status !== 'ok') return reauthFailureToState(result);
  await recordSecurityEvent('backup_codes_regenerated', {
    workspaceId: workspace?.id ?? null,
    userId: user.id,
  });
  return { status: 'codes', backupCodes: result.backupCodes };
}

export async function viewBackupCodesAction(
  _previous: SecurityState,
  data: FormData,
): Promise<SecurityState> {
  const { user, workspace } = await requireAppUser(SECURITY_ACCESS);
  const password = parseSecurityInput('password', data);
  if (!password.ok) return password.state;
  const result = await flows().viewBackupCodes({
    password: password.value,
    headers: (await requestContext()).headers,
  });
  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status !== 'ok') return reauthFailureToState(result);
  await recordSecurityEvent('backup_codes_viewed', {
    workspaceId: workspace?.id ?? null,
    userId: user.id,
  });
  return { status: 'codes', backupCodes: result.backupCodes };
}

export async function disableTwoFactorAction(
  _previous: SecurityState,
  data: FormData,
): Promise<SecurityState> {
  const { user, workspace } = await requireAppUser(SECURITY_ACCESS);
  const password = parseSecurityInput('password', data);
  if (!password.ok) return password.state;
  const result = await flows().disable({
    password: password.value,
    headers: (await requestContext()).headers,
  });
  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status !== 'ok') return reauthFailureToState(result);
  applyCookies(await cookies(), result.cookies);
  await recordSecurityEvent('two_factor_disabled', {
    workspaceId: workspace?.id ?? null,
    userId: user.id,
  });
  revalidatePath('/app/security');
  revalidatePath('/app/settings');
  return SECURITY_IDLE;
}

/**
 * Đổi mật khẩu: người dùng lấy từ phiên (không nhận userId từ form). Thành công → mọi phiên đã bị xóa → về /login
 * (`redirect` ném ngoại lệ nên đặt SAU khi đã có kết quả, ngoài try/catch).
 */
export async function changePasswordAction(
  _previous: SecurityState,
  data: FormData,
): Promise<SecurityState> {
  const { user, workspace } = await requireAppUser(SECURITY_ACCESS);
  const input = parseChangePasswordForm(data);
  if (!input.ok) return securityError(input.message);
  const result = await getAuthRuntime().changePassword.changePassword({
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
    headers: (await requestContext()).headers,
  });
  if (result.status === 'ok') {
    await recordSecurityEvent('password_changed', {
      workspaceId: workspace?.id ?? null,
      userId: user.id,
    });
    redirect('/password-changed');
  }
  if (result.status === 'unauthenticated') redirect('/login');
  return changePasswordToState(result);
}

/** "Đăng xuất tất cả thiết bị khác": người dùng + phiên hiện tại lấy từ cookie (không nhận gì từ form). */
export async function revokeOtherSessionsAction(): Promise<void> {
  const { user, workspace } = await requireAppUser(SECURITY_ACCESS);
  const removed = await flows().revokeOtherSessions((await requestContext()).headers);
  if (removed === null) redirect('/login');
  await recordSecurityEvent('other_sessions_revoked', {
    workspaceId: workspace?.id ?? null,
    userId: user.id,
    detail: { removed },
  });
  revalidatePath('/app/security');
  revalidatePath('/app/settings');
}

/** Đăng xuất MỘT phiên khác của chính mình (id từ form chỉ là gợi ý; saas-core kiểm phiên thuộc về người dùng). */
export async function revokeSessionAction(data: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser(SECURITY_ACCESS);
  const sessionId = parseSecurityInput('sessionId', data);
  if (!sessionId.ok) return; // id không phải uuid: không có phiên nào để đăng xuất
  const ok = await flows().revokeSession({
    sessionId: sessionId.value,
    headers: (await requestContext()).headers,
  });
  if (!ok && !(await flows().posture((await requestContext()).headers))) redirect('/login');
  if (ok) {
    await recordSecurityEvent('session_revoked', {
      workspaceId: workspace?.id ?? null,
      userId: user.id,
    });
  }
  revalidatePath('/app/security');
  revalidatePath('/app/settings');
}

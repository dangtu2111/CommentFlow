'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  reauthFailureToState,
  SECURITY_IDLE,
  type SecurityState,
} from '../../../lib/security-form';
import { getAuthRuntime } from '../../../server/auth';

/**
 * Server Action của trang bảo mật. Mỗi hàm đọc phiên từ cookie (phía server) — không nhận userId từ form —
 * và đổi kết quả của saas-core thành trạng thái cho giao diện. Chưa đăng nhập → về /login.
 */

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

const flows = () => getAuthRuntime().twoFactor;

/** Bước 1: nhập mật khẩu → QR + khóa nhập tay + mã dự phòng (chưa bật cho đến khi xác nhận mã đầu tiên). */
export async function beginTwoFactorAction(
  _previous: SecurityState,
  data: FormData,
): Promise<SecurityState> {
  const result = await flows().beginEnrollment({
    password: text(data, 'password'),
    headers: await headers(),
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

/** Bước 2: mã 6 chữ số đầu tiên → 2FA bật. Không `revalidatePath` ở đây để mã dự phòng còn hiện trên màn hình. */
export async function confirmTwoFactorAction(
  _previous: SecurityState,
  data: FormData,
): Promise<SecurityState> {
  const result = await flows().confirmEnrollment({
    code: text(data, 'code'),
    headers: await headers(),
  });
  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status !== 'ok') return reauthFailureToState(result);
  return { status: 'done' };
}

export async function regenerateBackupCodesAction(
  _previous: SecurityState,
  data: FormData,
): Promise<SecurityState> {
  const result = await flows().regenerateBackupCodes({
    password: text(data, 'password'),
    headers: await headers(),
  });
  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status !== 'ok') return reauthFailureToState(result);
  return { status: 'codes', backupCodes: result.backupCodes };
}

export async function disableTwoFactorAction(
  _previous: SecurityState,
  data: FormData,
): Promise<SecurityState> {
  const result = await flows().disable({
    password: text(data, 'password'),
    headers: await headers(),
  });
  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status !== 'ok') return reauthFailureToState(result);
  revalidatePath('/app/security');
  return SECURITY_IDLE;
}

/** Đăng xuất MỘT phiên khác của chính mình (id từ form chỉ là gợi ý; saas-core kiểm phiên thuộc về người dùng). */
export async function revokeSessionAction(data: FormData): Promise<void> {
  const ok = await flows().revokeSession({
    sessionId: text(data, 'sessionId'),
    headers: await headers(),
  });
  if (!ok && !(await flows().posture(await headers()))) redirect('/login');
  revalidatePath('/app/security');
}

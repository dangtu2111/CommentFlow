import type { ReactNode } from 'react';
import { requireAppUser } from '../../../server/require-app-user';

/**
 * Cổng của nhóm `(guarded)` (docs/13 §2): phiên, email đã xác minh, 2FA bắt buộc cho Owner/Admin. Mỗi trang con
 * VẪN tự gọi `requireAppUser` (layout không chạy lại khi chuyển trang trong cùng nhóm).
 */
export default async function GuardedAppLayout({ children }: { children: ReactNode }) {
  await requireAppUser({ workspace: 'optional' });
  return children;
}

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getAuthRuntime } from '../../../server/auth';

/**
 * Cổng bắt buộc 2FA (docs/13 §2): Owner của workspace và quản trị nền tảng chưa bật 2FA chỉ vào được
 * /app/security. Trạng thái đọc phía server từ phiên + vai trò thật, không bao giờ từ client.
 */
export default async function GuardedAppLayout({ children }: { children: ReactNode }) {
  const posture = await getAuthRuntime().twoFactor.posture(await headers());
  if (!posture) redirect('/login');
  if (posture.required && !posture.twoFactorEnabled) redirect('/app/security');
  return children;
}

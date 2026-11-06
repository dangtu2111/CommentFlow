import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthStatus } from '../../../components/auth/auth-status';
import { getBrand } from '../../../server/brand';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('passwordChanged.title')} · ${getBrand().name}` };
}

/**
 * Màn "Đổi mật khẩu thành công" (Stitch `settings-password-changed`). Đổi mật khẩu xóa MỌI phiên nên màn này nằm ngoài
 * khu đăng nhập: không đọc phiên, không nhận dữ liệu từ URL, chỉ nội dung tĩnh + lối quay lại đăng nhập.
 */
export default async function PasswordChangedPage() {
  const t = await getTranslations('auth.passwordChanged');
  return (
    <>
      <AuthStatus icon={ShieldCheck} tone="success" title={t('title')} description={t('body')}>
        <p className="rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
          {t('integrationsNote')}
        </p>
      </AuthStatus>
      <div className="flex flex-col items-center gap-space-sm">
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-space-lg py-3 font-label-md text-label-md text-on-primary hover:opacity-90"
        >
          {t('signIn')}
        </Link>
        <Link
          href="/app/activity"
          className="font-label-md text-label-md text-primary hover:underline"
        >
          {t('viewLog')}
        </Link>
      </div>
    </>
  );
}

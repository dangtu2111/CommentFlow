import { CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AcceptInviteForm } from '../../../components/app/accept-invite-form';
import { AuthShell } from '../../../components/auth/auth-shell';
import { AuthStatus } from '../../../components/auth/auth-status';
import { authButtonClass } from '../../../components/auth/auth-styles';
import { InviteShell } from '../../../components/auth/invite-panel';
import { INVITE_SAMPLE } from '../../../lib/invite-sample';
import { showSampleData } from '../../../lib/sample-data';
import { getAuthRuntime } from '../../../server/auth';
import { getBrand } from '../../../server/brand';
import { getCurrentUser } from '../../../server/session';

export async function generateMetadata() {
  const t = await getTranslations('invite');
  return { title: `${t('title')} · ${getBrand().name}` };
}

/**
 * Trang nhận lời mời (công khai: người nhận có thể chưa đăng nhập). Chỉ hiển thị tên workspace + vai trò của lời
 * mời CÒN HIỆU LỰC; mọi trường hợp khác (token sai, hết hạn, đã dùng, đã thu hồi) cho CÙNG một màn "không dùng
 * được". Không bao giờ hiển thị email được mời hay cho biết email nào đã có tài khoản.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [t, tr, preview, user] = await Promise.all([
    getTranslations('invite'),
    getTranslations('members.roles'),
    getAuthRuntime().workspaceAdmin.previewInvitation(token),
    getCurrentUser(),
  ]);

  if (!preview) {
    return (
      <AuthShell>
        <AuthStatus
          icon={CircleAlert}
          tone="danger"
          title={t('invalid.title')}
          description={t('invalid.body')}
        >
          <a className={authButtonClass('neutral')} href="/invite/clear">
            {t('invalid.action')}
          </a>
        </AuthStatus>
      </AuthShell>
    );
  }

  return (
    <InviteShell
      workspace={preview.workspaceName}
      role={tr(preview.role)}
      sample={showSampleData() ? INVITE_SAMPLE : undefined}
    >
      {user ? (
        <>
          <p className="font-body-md text-body-md text-on-surface-variant">{t('card.signedIn')}</p>
          <AcceptInviteForm token={token} />
          <a className={authButtonClass('neutral')} href="/invite/clear">
            {t('card.later')}
          </a>
        </>
      ) : (
        <>
          <p className="font-body-md text-body-md text-on-surface-variant">{t('card.signedOut')}</p>
          <Link
            className={authButtonClass()}
            href={`/invite/${token}/start?mode=login`}
            prefetch={false}
          >
            {t('card.login')}
          </Link>
          <Link
            className={authButtonClass('neutral')}
            href={`/invite/${token}/start?mode=register`}
            prefetch={false}
          >
            {t('card.register')}
          </Link>
        </>
      )}
    </InviteShell>
  );
}

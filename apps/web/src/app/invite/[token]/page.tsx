import { CircleAlert, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AcceptInviteForm } from '../../../components/app/accept-invite-form';
import { AuthShell } from '../../../components/auth/auth-shell';
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
        <div className="stack">
          <span className="status-icon status-icon-danger" aria-hidden="true">
            <CircleAlert size={28} />
          </span>
          <h1 className="auth-title">{t('invalid.title')}</h1>
          <p className="auth-subtitle">{t('invalid.body')}</p>
          <a className="btn btn-secondary btn-block" href="/invite/clear">
            {t('invalid.action')}
          </a>
        </div>
      </AuthShell>
    );
  }

  const role = tr(preview.role);
  return (
    <AuthShell>
      <div className="stack">
        <span className="status-icon status-icon-success" aria-hidden="true">
          <MailCheck size={28} />
        </span>
        <h1 className="auth-title">{t('card.title', { workspace: preview.workspaceName })}</h1>
        <p className="auth-subtitle">{t('card.role', { role })}</p>
        {user ? (
          <>
            <p className="muted">{t('card.signedIn')}</p>
            <AcceptInviteForm token={token} />
            <a className="btn btn-secondary btn-block" href="/invite/clear">
              {t('card.later')}
            </a>
          </>
        ) : (
          <>
            <p className="muted">{t('card.signedOut')}</p>
            <Link
              className="btn btn-primary btn-block"
              href={`/invite/${token}/start?mode=login`}
              prefetch={false}
            >
              {t('card.login')}
            </Link>
            <Link
              className="btn btn-secondary btn-block"
              href={`/invite/${token}/start?mode=register`}
              prefetch={false}
            >
              {t('card.register')}
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}

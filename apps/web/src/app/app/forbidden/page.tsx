import { Check, Lock } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SimpleTopbar } from '../../../components/app/simple-topbar';
import { splitNavByRole } from '../../../lib/app-nav';
import { getBrand } from '../../../server/brand';
import { requireAppUser } from '../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('errorPages.forbidden');
  return { title: `${t('title')} · ${getBrand().name}` };
}

/**
 * Trang 403 (design/stitch/error-403.png, docs/08 §7.8): giải thích vai trò hiện tại dùng được gì và gì chỉ dành cho
 * Owner. Danh sách lấy từ cùng bảng quyền với thanh điều hướng (`splitNavByRole`). Chỉ là trang thông tin: các trang
 * Owner vẫn trả 404 cho Staff (không lộ sự tồn tại, docs/13 §2) — Q-UIS1.
 */
export default async function ForbiddenPage() {
  const { user, workspace } = await requireAppUser({});
  const [t, tNav, tRole] = await Promise.all([
    getTranslations('errorPages.forbidden'),
    getTranslations('shell.nav'),
    getTranslations('workspace.switcher'),
  ]);
  const { allowed, ownerOnly } = splitNavByRole(workspace.role);
  const role = tRole(`role.${workspace.role}`);
  return (
    <div className="page-frame">
      <SimpleTopbar href="/app" workspaceName={workspace.name} />
      <main className="page-frame-main">
        <section className="card hero-card">
          <p className="hero-code hero-code-danger">{t('code')}</p>
          <h1 className="hero-title">{t('title')}</h1>
          <p className="hero-body">{t('body', { role })}</p>
          <p className="muted">
            {t('workspace')}: <strong>{workspace.name}</strong> · {t('signedInAs')}:{' '}
            <strong>{user.name}</strong> ·{' '}
            <span className="badge badge-off">{t('roleBadge', { role })}</span>
          </p>
        </section>
        <div className="two-col">
          <section className="card stack" aria-labelledby="allowed-title">
            <h2 id="allowed-title" className="section-title">
              {t('allowedTitle')}
            </h2>
            <ul className="perm-list">
              {allowed.map((item) => (
                <li key={item.key}>
                  <Check size={16} aria-hidden="true" className="perm-ok" />
                  <Link href={item.href}>{tNav(item.key)}</Link>
                </li>
              ))}
            </ul>
          </section>
          {ownerOnly.length > 0 ? (
            <section className="card stack" aria-labelledby="owner-title">
              <h2 id="owner-title" className="section-title">
                {t('ownerOnlyTitle')}
              </h2>
              <ul className="perm-list">
                {ownerOnly.map((item) => (
                  <li key={item.key}>
                    <Lock size={16} aria-hidden="true" className="perm-lock" />
                    {tNav(item.key)}
                  </li>
                ))}
              </ul>
              <p className="muted">{t('ownerOnlyHint')}</p>
            </section>
          ) : null}
        </div>
        <div className="row">
          <Link className="btn btn-primary" href="/app/comments">
            {t('back')}
          </Link>
        </div>
      </main>
    </div>
  );
}

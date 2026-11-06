import { ChevronRight, FileText, MessageSquareText, Settings } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BackButton } from '../components/app/back-button';
import { SimpleTopbar } from '../components/app/simple-topbar';

/**
 * Trang 404 (design/stitch/error-404.png, docs/08 §7.8). Không biết người xem đã đăng nhập hay chưa nên chỉ dẫn tới
 * trang có thật (khu /app tự chuyển tới đăng nhập khi cần). Không số liệu/mã lỗi giả (Q-UIS1).
 */
export default async function NotFound() {
  const t = await getTranslations('errorPages.notFound');
  const links = [
    { key: 'comments', href: '/app/comments', Icon: MessageSquareText },
    { key: 'posts', href: '/app/posts', Icon: FileText },
    { key: 'settings', href: '/app/settings', Icon: Settings },
  ] as const;
  return (
    <div className="page-frame">
      <SimpleTopbar href="/app" />
      <main className="page-frame-main">
        <section className="card hero-card">
          <p className="hero-code">{t('code')}</p>
          <h1 className="hero-title">{t('title')}</h1>
          <p className="hero-body">{t('body')}</p>
          <div className="row">
            <BackButton label={t('back')} />
            <Link className="btn btn-primary" href="/app/comments">
              {t('inbox')}
            </Link>
          </div>
        </section>
        <section aria-labelledby="quick-title" className="stack">
          <h2 id="quick-title" className="section-title">
            {t('quickTitle')}
          </h2>
          <ul className="quick-grid">
            {links.map(({ key, href, Icon }) => (
              <li key={key} className="card quick-card">
                <span className="quick-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <p className="section-subtitle">{t(`links.${key}.title`)}</p>
                <p className="muted">{t(`links.${key}.hint`)}</p>
                <Link className="quick-link" href={href}>
                  {t('open')} <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

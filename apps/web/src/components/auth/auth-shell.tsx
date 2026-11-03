import { Bot, Languages, MessageSquareText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '../locale-switcher';

/** Khung chung của mọi trang xác thực: đầu trang (logo + ngôn ngữ), panel giới thiệu, thẻ nội dung, chân trang. */
export async function AuthShell({ children }: { children: ReactNode }) {
  const t = await getTranslations('auth');
  const points = [
    { icon: ShieldCheck, text: t('panel.officialApi') },
    { icon: Bot, text: t('panel.humanInControl') },
    { icon: Languages, text: t('panel.bilingual') },
  ];
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <MessageSquareText size={18} />
          </span>
          {t('brand')}
        </Link>
        <LocaleSwitcher />
      </header>
      <main className="auth-main">
        <aside className="auth-panel">
          <h2 className="panel-title">{t('panel.title')}</h2>
          <p className="panel-subtitle">{t('panel.subtitle')}</p>
          <ul className="panel-points">
            {points.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={18} aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </aside>
        <section className="auth-card">{children}</section>
      </main>
      <footer className="auth-footer">
        <p>{t('footer.rights', { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}

/** Tab "Đăng nhập | Đăng ký": hai liên kết thật (không phải JS), trang hiện tại có aria-current. */
export async function AuthTabs({ active }: { active: 'login' | 'register' }) {
  const t = await getTranslations('auth.tabs');
  return (
    <nav className="tabs" aria-label={t('label')}>
      <Link href="/login" className="tab" aria-current={active === 'login' ? 'page' : undefined}>
        {t('login')}
      </Link>
      <Link
        href="/register"
        className="tab"
        aria-current={active === 'register' ? 'page' : undefined}
      >
        {t('register')}
      </Link>
    </nav>
  );
}

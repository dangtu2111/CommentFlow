import { Bot, Languages, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getBrand } from '../../server/brand';
import { BrandLogo } from '../brand-logo';
import { LocaleSwitcher } from '../locale-switcher';
import { Tabs } from '../ui/tabs';
import { AuthDemoCard } from './auth-demo-card';

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
        <BrandLogo href="/" />
        <LocaleSwitcher />
      </header>
      <main className="auth-main">
        <aside className="auth-panel">
          <ul className="panel-badges">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="panel-badge">
                <Icon size={14} aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <h2 className="panel-title">{t('panel.title')}</h2>
          <p className="panel-subtitle">{t('panel.subtitle')}</p>
          <AuthDemoCard />
          <p className="panel-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>{t('panel.securityNote')}</span>
          </p>
        </aside>
        <section className="auth-card">{children}</section>
      </main>
      <footer className="auth-footer">
        <p>{t('footer.rights', { year: new Date().getFullYear(), appName: getBrand().name })}</p>
      </footer>
    </div>
  );
}

const AUTH_TABS = [
  { key: 'login', href: '/login' },
  { key: 'register', href: '/register' },
] as const;

/** Tab "Đăng nhập | Đăng ký": hai liên kết thật (không phải JS), trang hiện tại có aria-current. */
export async function AuthTabs({ active }: { active: 'login' | 'register' }) {
  const t = await getTranslations('auth.tabs');
  return (
    <Tabs
      label={t('label')}
      items={AUTH_TABS.map((tab) => ({
        ...tab,
        label: t(tab.key),
        current: tab.key === active,
      }))}
    />
  );
}

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { showSampleData } from '../../lib/sample-data';
import { getBrand } from '../../server/brand';
import { LocaleSwitcher } from '../locale-switcher';
import { Icon } from '../ui/icon';
import { SoonButton } from '../ui/tw-parts';
import { AuthDemoCard } from './auth-demo-card';

/**
 * Đầu trang + chân trang chung của mọi trang xác thực (`design/stitch/auth-login-register.html`), bọc `.tw`.
 * Liên kết chưa có trang đích hiện đúng thiết kế nhưng vô hiệu ("Sắp có").
 */
export async function AuthChrome({ children }: { children: ReactNode }) {
  const t = await getTranslations('auth.ui');
  const soon = t('soon');
  return (
    <div className="tw">
      <div className="flex min-h-screen flex-col justify-between bg-surface font-body-md text-body-md text-on-surface selection:bg-primary-fixed selection:text-on-primary-fixed">
        <header className="fixed top-0 z-50 w-full bg-surface-container-lowest/80 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-margin">
            <Link href="/" className="group flex items-center gap-space-sm focus:outline-none">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary shadow-sm transition-colors group-hover:bg-primary-container">
                <Icon name="auto_awesome" size={20} />
              </span>
              <span className="font-title-md text-title-md font-bold tracking-tight text-on-surface">
                {getBrand().name}
              </span>
            </Link>
            <div className="flex items-center gap-space-lg">
              <LocaleSwitcher />
              <span className="h-4 w-px bg-outline-variant" />
              <SoonButton variant="link" soon={soon} className="text-on-surface-variant">
                <Icon name="help" size={18} />
                {t('header.help')}
              </SoonButton>
            </div>
          </div>
        </header>
        <main className="w-full flex-1 pt-16">{children}</main>
        <footer className="w-full bg-surface-container-low/70 shadow-[0_-1px_8px_rgba(0,0,0,0.02)] backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-space-md px-margin py-space-lg text-on-surface-variant md:flex-row">
            <SoonButton variant="link" soon={soon} className="text-on-surface-variant">
              <span className="h-2 w-2 rounded-full bg-primary-container" />
              {t('footer.status')}
            </SoonButton>
            <nav className="flex flex-wrap items-center justify-center gap-space-lg">
              <SoonButton variant="link" soon={soon} className="text-on-surface-variant">
                {t('footer.privacy')}
              </SoonButton>
              <SoonButton variant="link" soon={soon} className="text-on-surface-variant">
                {t('footer.terms')}
              </SoonButton>
              <SoonButton variant="link" soon={soon} className="text-on-surface-variant">
                {t('footer.support')}
              </SoonButton>
            </nav>
            <p className="font-label-sm text-label-sm text-outline">
              {t('footer.rights', { year: new Date().getFullYear(), appName: getBrand().name })}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

const BADGE_TONES = [
  'bg-primary-container text-on-primary',
  'bg-surface-container-lowest text-primary',
  'bg-secondary text-on-secondary',
] as const;
const BADGE_ICONS = ['verified_user', 'verified', 'auto_awesome'] as const;
const METRIC_TONES = ['text-primary', 'text-secondary', 'text-tertiary-container'] as const;

/** Cột trái: huy hiệu cam kết thật, tiêu đề, thẻ minh họa [MẪU], (chỉ bản dev) ô số liệu mẫu, ghi chú bảo mật. */
async function Showcase({ sample }: { sample: boolean }) {
  const t = await getTranslations('auth');
  const badges = [t('panel.officialApi'), t('panel.humanInControl'), t('panel.bilingual')];
  const metrics = [
    t('ui.showcase.metricShops'),
    t('ui.showcase.metricContext'),
    t('ui.showcase.metricHours'),
  ];
  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-surface-container-low via-surface-container to-secondary-fixed/20 p-space-xl shadow-sm lg:col-span-6 lg:p-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary-fixed/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-secondary-fixed/40 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-space-lg">
        <ul className="flex flex-wrap items-center gap-space-xs">
          {badges.map((text, i) => (
            <li
              key={text}
              className={`inline-flex items-center gap-1.5 rounded-full px-space-sm py-1 font-label-sm text-label-sm shadow-sm ${BADGE_TONES[i]}`}
            >
              <Icon name={BADGE_ICONS[i] ?? 'verified'} size={14} />
              {text}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-space-xs">
          <h2 className="font-headline-lg text-headline-lg leading-tight tracking-tight text-on-surface">
            {t('panel.title')}
          </h2>
          <p className="max-w-xl font-body-lg text-body-lg text-on-surface-variant">
            {t('panel.subtitle')}
          </p>
        </div>
        <AuthDemoCard />
        {sample ? (
          <div className="grid grid-cols-3 gap-space-sm pt-space-xs">
            {metrics.map((label, i) => (
              <div
                key={label}
                className="flex flex-col rounded-lg bg-surface-container-lowest/80 p-space-md shadow-sm backdrop-blur-sm"
              >
                <span className={`font-headline-md text-headline-md font-bold ${METRIC_TONES[i]}`}>
                  {t('ui.showcase.metricValue')}
                </span>
                <span className="font-label-md text-label-md text-on-surface-variant">{label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <p className="relative z-10 flex items-center gap-space-sm pt-space-lg font-body-sm text-body-sm text-on-surface-variant">
        <span className="shrink-0 text-primary">
          <Icon name="lock_open_right" size={20} />
        </span>
        <span>{t('panel.securityNote')}</span>
      </p>
    </div>
  );
}

/**
 * Khung chung của mọi trang xác thực: đầu trang, panel giới thiệu (trái), thẻ nội dung (phải), chân trang.
 * `sample` bật các ô số liệu mẫu `[MẪU]` (mặc định chỉ khi `APP_ENV=dev`; route `/dev/ui/auth*` luôn bật).
 */
export async function AuthShell({
  children,
  sample = showSampleData(),
}: {
  children: ReactNode;
  sample?: boolean;
}) {
  const t = await getTranslations('auth.ui');
  const legal = t.rich('card.legal', {
    terms: (chunk) => <span className="font-semibold text-primary">{chunk}</span>,
    privacy: (chunk) => <span className="font-semibold text-primary">{chunk}</span>,
  });
  return (
    <AuthChrome>
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-7xl items-center justify-center px-margin py-space-xl">
        <div className="grid w-full grid-cols-1 items-stretch gap-gutter lg:grid-cols-12 lg:gap-space-xl">
          <Showcase sample={sample} />
          <div className="flex flex-col justify-center lg:col-span-6">
            <section className="flex w-full flex-col gap-space-lg rounded-xl bg-surface-container-lowest p-space-xl shadow-xl lg:p-10">
              {children}
              <div className="flex flex-col items-center gap-space-xs pt-space-xs text-center">
                <p className="max-w-sm font-label-sm text-label-sm text-on-surface-variant">
                  {legal}
                </p>
                <div className="flex items-center gap-space-md pt-1 font-label-sm text-label-sm text-outline">
                  <span className="flex items-center gap-1">
                    <Icon name="lock" size={14} />
                    {t('card.encrypted')}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Icon name="verified_user" size={14} />
                    {t('card.officialApi')}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AuthChrome>
  );
}

const AUTH_TABS = [
  { key: 'login', href: '/login', icon: 'login' },
  { key: 'register', href: '/register', icon: 'how_to_reg' },
] as const;

/** Tab "Đăng nhập | Đăng ký": hai liên kết thật (không phải JS), trang hiện tại có aria-current. */
export async function AuthTabs({ active }: { active: 'login' | 'register' }) {
  const t = await getTranslations('auth.tabs');
  return (
    <nav aria-label={t('label')} className="flex items-center rounded-lg bg-surface-container p-1">
      {AUTH_TABS.map((tab) => {
        const current = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-center font-title-sm text-title-sm transition-all ${
              current
                ? `bg-surface-container-lowest shadow-sm ${tab.key === 'login' ? 'text-primary' : 'text-secondary'}`
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icon name={tab.icon} size={16} />
            <span>{t(tab.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Tiêu đề + mô tả của thẻ xác thực (h1 duy nhất của trang). */
export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-space-xs">
      <h1 className="font-headline-md text-headline-md text-on-surface">{title}</h1>
      {subtitle ? (
        <p className="font-body-md text-body-md text-on-surface-variant">{subtitle}</p>
      ) : null}
    </div>
  );
}

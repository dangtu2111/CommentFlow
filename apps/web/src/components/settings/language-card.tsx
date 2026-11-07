import { LOCALES } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { setLocale } from '../../app/actions';
import { setThemeAction } from '../../app/app/(guarded)/settings/profile-actions';
import { cn } from '../../lib/cn';
import type { ThemeChoice } from '../../lib/theme';
import { Icon } from '../ui/icon';
import { TwCard, TwCardHead } from './tw/ui';

const TITLE_ID = 'language-title';

const THEME_OPTIONS = [
  { value: 'light', icon: 'light_mode', labelKey: 'light' },
  { value: 'dark', icon: 'dark_mode', labelKey: 'dark' },
  { value: 'system', icon: 'computer', labelKey: 'system' },
] as const;

/**
 * Thẻ "Tùy chọn hiển thị & Ngôn ngữ" ở Cài đặt (FR-119; design/stitch/settings-security.html). Ngôn ngữ lưu cookie qua
 * `setLocale` (ngôn ngữ đang dùng bị khóa). Chế độ giao diện Sáng/Tối/Theo hệ thống: `setThemeAction` lưu `users.theme` + cookie
 * `cf-theme` (Q-WPROF1); token tối hiện áp cho khung Cài đặt (`styles/theme-dark.css`).
 */
export async function LanguageCard({ theme }: { theme: ThemeChoice }) {
  const [t, tl, current] = await Promise.all([
    getTranslations('settings.display'),
    getTranslations('language'),
    getLocale(),
  ]);
  return (
    <TwCard labelledBy={TITLE_ID}>
      <TwCardHead
        id={TITLE_ID}
        icon={<Icon name="tune" size={24} />}
        title={t('title')}
        description={t('body')}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg pt-1">
        <form action={setLocale} aria-label={t('languageLabel')} className="space-y-2">
          <p className="font-title-sm text-title-sm text-on-surface">{t('languageLabel')}</p>
          <div className="grid grid-cols-2 gap-2">
            {LOCALES.map((locale) => (
              <button
                key={locale}
                type="submit"
                name="locale"
                value={locale}
                aria-pressed={locale === current}
                disabled={locale === current}
                lang={locale}
                className={cn(
                  'p-2.5 rounded-lg flex items-center justify-between font-title-sm text-title-sm transition-colors',
                  locale === current
                    ? 'bg-primary-container text-on-primary shadow-sm'
                    : 'bg-surface-container-low text-on-surface hover:bg-surface-container',
                )}
              >
                {tl(locale)}
                {locale === current ? <Icon name="check" size={16} /> : null}
              </button>
            ))}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">{t('languageHint')}</p>
        </form>
        <form action={setThemeAction} aria-label={t('themeLabel')} className="space-y-2">
          <p className="font-title-sm text-title-sm text-on-surface">{t('themeLabel')}</p>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, icon, labelKey }) => {
              const selected = theme === value;
              return (
                <button
                  key={value}
                  type="submit"
                  name="theme"
                  value={value}
                  aria-pressed={selected}
                  disabled={selected}
                  className={cn(
                    'p-2.5 rounded-lg flex items-center justify-between gap-1 font-title-sm text-title-sm transition-colors',
                    selected
                      ? 'bg-primary-container text-on-primary shadow-sm'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon name={icon} size={16} />
                    {t(labelKey)}
                  </span>
                  {selected ? <Icon name="check" size={16} /> : null}
                </button>
              );
            })}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">{t('themeHint')}</p>
        </form>
      </div>
    </TwCard>
  );
}

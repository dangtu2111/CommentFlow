import { LOCALES } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { setLocale } from '../../app/actions';
import { cn } from '../../lib/cn';
import { Icon } from '../ui/icon';
import { TwCard, TwCardHead } from './tw/ui';

const TITLE_ID = 'language-title';

/**
 * Thẻ "Tùy chọn hiển thị & Ngôn ngữ" ở Cài đặt (FR-119; design/stitch/settings-security.html). Ngôn ngữ lưu cookie qua
 * `setLocale` (ngôn ngữ đang dùng bị khóa). Chế độ giao diện: Sáng đang dùng; Tối chưa có → khóa + "Sắp ra mắt" (Q-UISET2).
 */
export async function LanguageCard() {
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
        <fieldset className="space-y-2 border-0 p-0 m-0 min-w-0">
          <legend className="font-title-sm text-title-sm text-on-surface mb-2">
            {t('themeLabel')}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed="true"
              disabled
              className="p-2.5 rounded-lg bg-primary-container text-on-primary flex items-center justify-between shadow-sm"
            >
              <span className="flex items-center gap-2 font-title-sm text-title-sm">
                <Icon name="light_mode" size={16} />
                {t('light')}
              </span>
              <Icon name="check" size={16} />
            </button>
            <button
              type="button"
              aria-pressed="false"
              aria-disabled="true"
              disabled
              className="p-2.5 rounded-lg bg-surface-container-low text-on-surface-variant flex items-center justify-between opacity-70"
            >
              <span className="flex items-center gap-2 font-title-sm text-title-sm">
                <Icon name="dark_mode" size={16} />
                {t('dark')}
              </span>
              <span className="font-label-sm text-label-sm text-primary font-medium">
                {t('soon')}
              </span>
            </button>
          </div>
        </fieldset>
      </div>
    </TwCard>
  );
}

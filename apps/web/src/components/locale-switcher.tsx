import { LOCALES } from '@flow/shared';
import { Globe } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { setLocale } from '../app/actions';

/** Bộ chọn ngôn ngữ (FR-119); lưu vào cookie. Nút ngôn ngữ đang dùng ở trạng thái đã chọn. */
export async function LocaleSwitcher() {
  const t = await getTranslations('language');
  const current = await getLocale();
  return (
    <form action={setLocale} className="locale-switch" aria-label={t('label')}>
      <Globe size={16} aria-hidden="true" />
      <span className="visually-hidden">{t('label')}</span>
      <span className="locale-switch-group">
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="submit"
            name="locale"
            value={locale}
            aria-pressed={locale === current}
            disabled={locale === current}
            lang={locale}
          >
            {t(locale)}
          </button>
        ))}
      </span>
    </form>
  );
}

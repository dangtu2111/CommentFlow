import { LOCALES } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { setLocale } from '../app/actions';

export async function LocaleSwitcher() {
  const t = await getTranslations('language');
  const current = await getLocale();
  return (
    <form action={setLocale} aria-label={t('label')}>
      <span>{t('label')}: </span>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="submit"
          name="locale"
          value={locale}
          aria-pressed={locale === current}
          disabled={locale === current}
        >
          {t(locale)}
        </button>
      ))}
    </form>
  );
}

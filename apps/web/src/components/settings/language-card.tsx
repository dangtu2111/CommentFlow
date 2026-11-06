import { LOCALES } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { setLocale } from '../../app/actions';

/** Thẻ chọn ngôn ngữ giao diện ở Cài đặt (FR-119); lưu cookie qua `setLocale`. Ngôn ngữ đang dùng bị khóa. */
export async function LanguageCard() {
  const [t, tl, current] = await Promise.all([
    getTranslations('settings.language'),
    getTranslations('language'),
    getLocale(),
  ]);
  return (
    <section className="card stack" aria-labelledby="language-title">
      <h2 id="language-title" className="section-title">
        {t('title')}
      </h2>
      <p className="muted">{t('body')}</p>
      <form action={setLocale} aria-label={t('title')} className="locale-switch-group">
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="submit"
            name="locale"
            value={locale}
            className={`btn ${locale === current ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={locale === current}
            disabled={locale === current}
            lang={locale}
          >
            {tl(locale)}
          </button>
        ))}
      </form>
    </section>
  );
}

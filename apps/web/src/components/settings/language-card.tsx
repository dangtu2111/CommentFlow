import { LOCALES } from '@flow/shared';
import { Moon, SlidersHorizontal, Sun } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { setLocale } from '../../app/actions';
import { SectionHead } from '../ui/section-head';

/**
 * Thẻ "Tùy chọn hiển thị & Ngôn ngữ" ở Cài đặt (FR-119; design/stitch/settings-security.png). Ngôn ngữ lưu cookie qua
 * `setLocale` (ngôn ngữ đang dùng bị khóa). Chế độ giao diện: Sáng đang dùng; Tối chưa có → khóa + "Sắp ra mắt" (Q-UISET2).
 */
export async function LanguageCard() {
  const [t, tl, current] = await Promise.all([
    getTranslations('settings.display'),
    getTranslations('language'),
    getLocale(),
  ]);
  return (
    <section className="card stack" aria-labelledby="language-title">
      <SectionHead
        id="language-title"
        icon={<SlidersHorizontal size={22} />}
        title={t('title')}
        description={t('body')}
      />
      <div className="display-grid">
        <form action={setLocale} aria-label={t('languageLabel')} className="stack-tight">
          <p className="field-label">{t('languageLabel')}</p>
          <div className="locale-switch-group">
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
          </div>
          <p className="muted">{t('languageHint')}</p>
        </form>
        <fieldset className="stack-tight fieldset-plain">
          <legend className="field-label">{t('themeLabel')}</legend>
          <div className="locale-switch-group">
            <button type="button" className="btn btn-primary" aria-pressed="true" disabled>
              <Sun size={16} aria-hidden="true" />
              {t('light')}
            </button>
            <button type="button" className="btn btn-secondary" aria-pressed="false" disabled>
              <Moon size={16} aria-hidden="true" />
              {t('dark')}
              <span className="chip chip-muted">{t('soon')}</span>
            </button>
          </div>
        </fieldset>
      </div>
    </section>
  );
}

import { getTranslations } from 'next-intl/server';
import { Icon } from '../ui/icon';

/**
 * Thẻ minh họa ở panel trái trang xác thực (`auth-login-register.html`). TOÀN BỘ là dữ liệu MẪU để giải thích sản phẩm:
 * luôn gắn nhãn `[MẪU]`, không có số liệu/độ tin cậy giả, không đọc thành nội dung thật (aria-hidden + chú thích cho
 * trình đọc màn hình).
 */
export async function AuthDemoCard() {
  const t = await getTranslations('auth.demo');
  return (
    <figure
      className="m-0 flex flex-col gap-space-md rounded-xl bg-surface-container-lowest/90 p-space-lg shadow-md backdrop-blur-md"
      aria-label={t('aria')}
    >
      <div aria-hidden="true" className="flex flex-col gap-space-md">
        <figcaption className="flex items-center justify-between border-b border-surface-container-high/40 pb-space-xs">
          <span className="flex items-center gap-space-xs">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="rounded bg-tertiary-fixed px-1.5 font-label-sm text-label-sm text-on-tertiary-fixed">
              {t('sample')}
            </span>
            <span className="font-title-sm text-title-sm text-on-surface">{t('title')}</span>
          </span>
          <span className="flex items-center gap-1 rounded-full bg-secondary-fixed px-space-sm py-0.5 font-label-sm text-label-sm text-secondary">
            <Icon name="speed" size={13} />
            {t('speed')}
          </span>
        </figcaption>
        <div className="flex items-start gap-space-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
            <Icon name="person" size={18} />
          </span>
          <div className="flex-1 rounded-lg bg-surface-container-low p-space-sm text-on-surface">
            <div className="mb-1 flex items-center justify-between gap-2">
              <strong className="font-title-sm text-title-sm">{t('customerName')}</strong>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {t('justNow')}
              </span>
            </div>
            <p className="font-body-md text-body-md">{t('customerComment')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-space-xs pl-space-lg">
          <div className="flex flex-wrap items-center gap-space-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container px-space-sm py-0.5 font-label-sm text-label-sm text-on-secondary-container">
              <Icon name="filter_alt" size={13} />
              {t('tagIntent')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-error-container px-space-sm py-0.5 font-label-sm text-label-sm text-on-error-container">
              <Icon name="shield" size={13} />
              {t('tagPii')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-space-sm py-0.5 font-label-sm text-label-sm text-on-surface-variant">
              <Icon name="sync" size={13} />
              {t('tagCrm')}
            </span>
          </div>
          <div className="mt-1 flex items-start gap-space-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary shadow-sm">
              <Icon name="smart_toy" size={16} />
            </span>
            <div className="flex-1 rounded-lg bg-secondary-fixed/30 p-space-sm text-on-surface">
              <div className="mb-1 flex items-center justify-between">
                <strong className="flex items-center gap-1 font-title-sm text-title-sm text-secondary">
                  {t('aiName')}
                  <Icon name="auto_awesome" size={14} />
                </strong>
                <span className="font-label-sm text-label-sm font-semibold text-primary">
                  {t('needsReview')}
                </span>
              </div>
              <p className="font-body-md text-body-md">{t('aiDraft')}</p>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

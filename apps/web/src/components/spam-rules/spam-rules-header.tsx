import { getTranslations } from 'next-intl/server';
import { Icon } from '../ui/icon';
import { RICH_BOLD } from '../ui/rich';

const PILL =
  'flex items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm text-on-surface';

/**
 * Đầu trang Quy tắc spam (design/stitch/spam-rules.html): đường dẫn + hai viên thống kê nhanh, tiêu đề có ô biểu tượng
 * và huy hiệu, hai nút (kiểm tra 7 ngày / tạo quy tắc — cả hai nhảy tới trình thiết lập), khối nguyên tắc an toàn.
 * `activeRules`/`filtered7d` null = chưa có số liệu thật → "—".
 */
export async function SpamRulesHeader({
  activeRules,
  filtered7d,
}: {
  activeRules: number | null;
  filtered7d: number | null;
}) {
  const t = await getTranslations('spamRules');
  const autoHideSoon = t.rich('principle.autoHideSoon', RICH_BOLD);
  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-md">
        <nav
          aria-label={t('header.crumbLabel')}
          className="flex items-center gap-2 font-label-sm text-label-sm"
        >
          <span className="uppercase tracking-wider text-on-surface-variant">
            {t('header.crumbRoot')}
          </span>
          <span aria-hidden="true" className="text-outline-variant">
            /
          </span>
          <span aria-current="page" className="font-semibold text-primary">
            {t('header.crumbCurrent')}
          </span>
        </nav>
        <div className="flex items-center gap-space-sm">
          <span className={PILL}>
            <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
            <span>
              {activeRules === null ? '—' : t('header.pillActive', { count: activeRules })}
            </span>
          </span>
          <span className={PILL}>
            <span className="text-tertiary">
              <Icon name="history_toggle_off" size={14} />
            </span>
            <span>
              {filtered7d === null ? '—' : t('header.pillFiltered', { count: filtered7d })}
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-space-md">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-primary-container shadow-sm">
            <Icon name="shield_locked" size={24} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-space-sm">
              <h1 className="font-headline-md text-headline-md tracking-tight text-on-surface">
                {t('title')}
              </h1>
              <span className="flex items-center gap-1 rounded-full bg-surface-container-lowest px-2.5 py-0.5 font-label-sm text-label-sm text-primary shadow-sm">
                <Icon name="verified_user" size={12} />
                <span>{t('header.badge')}</span>
              </span>
            </div>
            <p className="mt-0.5 font-body-md text-body-md text-on-surface-variant">
              {t('subtitle')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-space-sm">
          <a
            href="#spam-builder"
            className="flex items-center gap-1.5 rounded-lg bg-surface-container-lowest px-3.5 py-2 font-title-sm text-title-sm text-on-surface shadow-sm transition-all hover:bg-surface-container"
          >
            <span className="text-primary-container">
              <Icon name="analytics" size={16} />
            </span>
            <span>{t('header.dryRun')}</span>
          </a>
          <a
            href="#spam-builder"
            className="flex items-center gap-1.5 rounded-lg bg-primary-container px-4 py-2 font-title-sm text-title-sm text-on-primary shadow-sm transition-all hover:bg-primary"
          >
            <Icon name="add_moderator" size={16} />
            <span>{t('header.create')}</span>
          </a>
        </div>
      </div>

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="flex flex-col items-start justify-between gap-space-md md:flex-row md:items-center">
          <div className="flex items-start gap-space-md">
            <div
              aria-hidden="true"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tertiary-fixed text-on-tertiary-fixed shadow-sm"
            >
              <Icon name="shield" size={18} />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-title-sm text-title-sm font-bold text-on-surface">
                  {t('principle.title')}
                </strong>
                <span className="rounded-full bg-surface-container-lowest px-2 py-0.5 font-label-sm text-label-sm font-semibold text-tertiary shadow-sm">
                  {t('principle.zero')}
                </span>
              </div>
              <p className="max-w-4xl font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
                {t('principle.body')}
              </p>
              <p className="max-w-4xl font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
                {autoHideSoon}
              </p>
            </div>
          </div>
          <span
            aria-disabled="true"
            title={t('soonTitle')}
            className="flex shrink-0 cursor-not-allowed items-center gap-1 self-end font-label-sm text-label-sm font-semibold text-primary opacity-70 md:self-center"
          >
            {t('principle.learn')}
            <Icon name="arrow_forward" size={12} />
          </span>
        </div>
      </div>
    </div>
  );
}

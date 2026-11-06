import { getTranslations } from 'next-intl/server';
import type { SampleHiddenComment, SpamMetricsData } from '../../lib/spam-rules-sample';
import { Icon } from '../ui/icon';
import { RICH_BOLD } from '../ui/rich';
import { FIELD_CLASS } from '../ui/tw-form';
import { Badge, Panel } from '../ui/tw-parts';
import { TwPlatformBadge } from '../ui/tw-platform-badge';

const CHECKBOX = 'h-4 w-4 cursor-not-allowed rounded accent-primary-container';
const ICON_BTN =
  'flex cursor-not-allowed items-center justify-center rounded p-1 text-on-surface-variant opacity-70';
const PAGE_BTN =
  'cursor-not-allowed rounded-lg bg-surface-container-lowest px-3 py-1.5 font-label-sm text-label-sm text-on-surface opacity-70';
const TH = 'px-4 py-3';

/**
 * Khung nhìn "Bình luận đã bị ẩn" (design/stitch/spam-rules.html): thanh công cụ + bảng nhật ký + phân trang.
 * Quy tắc hiện chỉ đánh dấu/bỏ qua (Tự ẩn chưa có) nên chưa có bình luận bị ẩn thật: `rows` rỗng → trạng thái
 * trống; có `rows` là DỮ LIỆU MẪU `[MẪU]` ở bản dev. Mọi nút/ô đều vô hiệu ("Sắp có").
 */
export async function SpamHiddenLog({
  rows,
  totals,
}: {
  rows: readonly SampleHiddenComment[];
  totals: Pick<SpamMetricsData, 'logsTotal' | 'logsFrom' | 'logsTo'> | null;
}) {
  const t = await getTranslations('spamRules');
  const showing = totals
    ? t.rich('logs.showing', {
        from: totals.logsFrom,
        to: totals.logsTo,
        total: totals.logsTotal,
        ...RICH_BOLD,
      })
    : '—';
  const soon = { disabled: true, 'aria-disabled': true, title: t('soonTitle') } as const;
  return (
    <div className="space-y-space-md">
      <Panel className="flex flex-col justify-between gap-space-md md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-space-md">
          <label className="flex items-center gap-2">
            <input type="checkbox" className={CHECKBOX} {...soon} aria-label={t('logs.select')} />
            <strong className="font-title-sm text-title-sm font-semibold text-on-surface">
              {t('logs.selectAll', { count: totals?.logsTotal ?? '—' })}
            </strong>
          </label>
          <div className="hidden h-4 w-px bg-surface-container-high sm:block" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary-container px-3 py-1.5 font-title-sm text-title-sm text-on-primary opacity-60 shadow-sm"
              {...soon}
            >
              <Icon name="undo" size={16} />
              <span>{t('logs.restoreBulk')}</span>
            </button>
            <button
              type="button"
              className="flex cursor-not-allowed items-center gap-1 rounded-lg bg-surface-container-low px-3 py-1.5 font-title-sm text-title-sm text-on-surface opacity-60"
              {...soon}
            >
              <Icon name="playlist_add_check" size={16} />
              <span>{t('logs.notSpam')}</span>
            </button>
            <Badge tone="neutral">{t('soon')}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-2 text-on-surface-variant">
              <Icon name="search" size={16} />
            </span>
            <input
              type="search"
              className={`${FIELD_CLASS} w-64 bg-surface-container-low py-1.5 pl-8 pr-3 shadow-inner`}
              placeholder={t('logs.search')}
              aria-label={t('logs.search')}
              {...soon}
            />
          </div>
          <button
            type="button"
            aria-disabled="true"
            tabIndex={-1}
            title={t('logs.advancedFilter')}
            aria-label={t('logs.advancedFilter')}
            className="flex cursor-not-allowed items-center justify-center rounded-lg bg-surface-container-low p-1.5 text-on-surface opacity-70"
          >
            <Icon name="filter_alt" size={18} />
          </button>
        </div>
      </Panel>

      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-container bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant">
                <th scope="col" className={`${TH} w-10`}>
                  <span className="sr-only">{t('logs.select')}</span>
                </th>
                <th scope="col" className={TH}>
                  {t('logs.colCustomer')}
                </th>
                <th scope="col" className={TH}>
                  {t('logs.colContent')}
                </th>
                <th scope="col" className={TH}>
                  {t('logs.colRule')}
                </th>
                <th scope="col" className={TH}>
                  {t('logs.colTime')}
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  {t('logs.colActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <strong className="block font-title-md text-title-md text-on-surface">
                      {t('logs.empty')}
                    </strong>
                    <span className="font-body-md text-body-md text-on-surface-variant">
                      {t('logs.emptyBody')}
                    </span>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const danger = row.footnoteTone === 'danger';
                  return (
                    <tr
                      key={row.id}
                      className="transition-colors hover:bg-surface-container-low/50"
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          className={CHECKBOX}
                          {...soon}
                          aria-label={t('logs.select')}
                        />
                      </td>
                      <td className="min-w-[200px] px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <TwPlatformBadge platform={row.platform} />
                          <div className="min-w-0">
                            <strong className="block truncate font-title-sm text-title-sm font-semibold text-on-surface">
                              {row.customer}
                            </strong>
                            <span className="block truncate font-label-sm text-label-sm text-on-surface-variant">
                              {row.source}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-md px-4 py-3.5">
                        <p className="text-on-surface">
                          {row.before}
                          <mark
                            className={`rounded px-1.5 py-0.5 font-bold ${
                              danger
                                ? 'bg-error-container font-semibold text-on-error-container'
                                : 'bg-primary-fixed text-on-primary-fixed'
                            }`}
                          >
                            {row.highlight}
                          </mark>
                          {row.after}
                        </p>
                        <p
                          className={`mt-1 flex items-center gap-1 font-label-sm text-label-sm ${
                            danger ? 'text-error' : 'text-secondary'
                          }`}
                        >
                          <Icon name={danger ? 'gpp_bad' : 'cloud_done'} size={12} />
                          {row.footnote}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <span
                          className={`flex w-fit items-center gap-1 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-semibold ${
                            row.ruleIcon === 'shield'
                              ? 'bg-primary-container text-on-primary'
                              : 'bg-surface-container-high text-primary-container'
                          }`}
                        >
                          <Icon
                            name={row.ruleIcon === 'shield' ? 'shield' : 'link_off'}
                            size={12}
                          />
                          {row.rule}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-label-sm text-label-sm text-on-surface-variant">
                        <strong className="block font-medium text-on-surface">{row.ago}</strong>
                        <span>{row.at}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            aria-disabled="true"
                            tabIndex={-1}
                            title={t('logs.restoreTitle')}
                            className="flex cursor-not-allowed items-center gap-1 rounded bg-surface-container-high px-2.5 py-1 font-title-sm text-title-sm text-primary opacity-70"
                          >
                            <Icon name="undo" size={14} />
                            <span>{t('logs.restore')}</span>
                          </button>
                          <span
                            aria-disabled="true"
                            title={t('logs.openOriginal')}
                            className={ICON_BTN}
                          >
                            <Icon name="open_in_new" size={16} />
                          </span>
                          <button
                            type="button"
                            aria-disabled="true"
                            tabIndex={-1}
                            title={
                              row.secondary === 'flag' ? t('logs.reportWrong') : t('logs.blockUser')
                            }
                            aria-label={
                              row.secondary === 'flag' ? t('logs.reportWrong') : t('logs.blockUser')
                            }
                            className={ICON_BTN}
                          >
                            <Icon name={row.secondary === 'flag' ? 'flag' : 'block'} size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col items-center justify-between gap-space-md bg-surface-container-low p-space-md sm:flex-row">
          <p className="font-label-sm text-label-sm text-on-surface-variant">{showing}</p>
          <div className="flex items-center gap-1">
            <button type="button" aria-disabled="true" tabIndex={-1} className={PAGE_BTN}>
              {t('logs.prev')}
            </button>
            {totals ? (
              <>
                <button
                  type="button"
                  aria-disabled="true"
                  aria-current="page"
                  tabIndex={-1}
                  className="cursor-not-allowed rounded-lg bg-primary-container px-3 py-1.5 font-label-sm text-label-sm font-semibold text-on-primary"
                >
                  1
                </button>
                <button type="button" aria-disabled="true" tabIndex={-1} className={PAGE_BTN}>
                  2
                </button>
                <button type="button" aria-disabled="true" tabIndex={-1} className={PAGE_BTN}>
                  3
                </button>
                <span aria-hidden="true" className="px-2 text-on-surface-variant">
                  ...
                </span>
                <button type="button" aria-disabled="true" tabIndex={-1} className={PAGE_BTN}>
                  {Math.ceil(totals.logsTotal / 3)}
                </button>
              </>
            ) : null}
            <button type="button" aria-disabled="true" tabIndex={-1} className={PAGE_BTN}>
              {t('logs.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

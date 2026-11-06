import {
  Ban,
  Cloud,
  ExternalLink,
  Filter,
  Flag,
  Link2Off,
  ListChecks,
  Search,
  Shield,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { SampleHiddenComment, SpamMetricsData } from '../../lib/spam-rules-sample';
import { Card } from '../ui/card';
import { Chip } from '../ui/chip';
import { PlatformBadge } from '../ui/platform-badge';
import { RICH_BOLD } from '../ui/rich';

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
  const soon = { disabled: true, title: t('soonTitle') } as const;
  return (
    <div className="stack">
      <Card className="spam-log-toolbar">
        <div className="spam-log-select">
          <label className="row">
            <input type="checkbox" {...soon} aria-label={t('logs.select')} />
            <strong>{t('logs.selectAll', { count: totals?.logsTotal ?? '—' })}</strong>
          </label>
          <button type="button" className="btn btn-primary" {...soon}>
            <Undo2 size={16} aria-hidden="true" />
            {t('logs.restoreBulk')}
          </button>
          <button type="button" className="btn btn-secondary" {...soon}>
            <ListChecks size={16} aria-hidden="true" />
            {t('logs.notSpam')}
          </button>
          <Chip tone="muted">{t('soon')}</Chip>
        </div>
        <div className="spam-log-search">
          <span className="spam-search-wrap">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              className="input"
              placeholder={t('logs.search')}
              aria-label={t('logs.search')}
              {...soon}
            />
          </span>
          <button
            type="button"
            className="icon-button"
            disabled
            title={t('logs.advancedFilter')}
            aria-label={t('logs.advancedFilter')}
          >
            <Filter size={18} aria-hidden="true" />
          </button>
        </div>
      </Card>
      <Card className="spam-log-table-card">
        <div className="auto-table-wrap">
          <table className="table spam-log-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">{t('logs.select')}</span>
                </th>
                <th scope="col">{t('logs.colCustomer')}</th>
                <th scope="col">{t('logs.colContent')}</th>
                <th scope="col">{t('logs.colRule')}</th>
                <th scope="col">{t('logs.colTime')}</th>
                <th scope="col">{t('logs.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="spam-log-empty">
                    <strong>{t('logs.empty')}</strong>
                    <span className="muted">{t('logs.emptyBody')}</span>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input type="checkbox" {...soon} aria-label={t('logs.select')} />
                    </td>
                    <td>
                      <div className="spam-log-customer">
                        <PlatformBadge platform={row.platform} />
                        <div>
                          <strong>{row.customer}</strong>
                          <span className="muted">{row.source}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p>
                        {row.before}
                        <mark className={row.footnoteTone === 'danger' ? 'is-danger' : undefined}>
                          {row.highlight}
                        </mark>
                        {row.after}
                      </p>
                      <p className={`spam-log-note is-${row.footnoteTone}`}>
                        {row.footnoteTone === 'danger' ? (
                          <ShieldAlert size={12} aria-hidden="true" />
                        ) : (
                          <Cloud size={12} aria-hidden="true" />
                        )}
                        {row.footnote}
                      </p>
                    </td>
                    <td>
                      <Chip tone={row.ruleIcon === 'shield' ? 'solid' : 'info'}>
                        {row.ruleIcon === 'shield' ? (
                          <Shield size={12} aria-hidden="true" />
                        ) : (
                          <Link2Off size={12} aria-hidden="true" />
                        )}
                        {row.rule}
                      </Chip>
                    </td>
                    <td>
                      <strong>{row.ago}</strong>
                      <span className="muted">{row.at}</span>
                    </td>
                    <td>
                      <div className="spam-log-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled
                          title={t('logs.restoreTitle')}
                        >
                          <Undo2 size={14} aria-hidden="true" />
                          {t('logs.restore')}
                        </button>
                        <span
                          className="icon-button"
                          aria-disabled="true"
                          title={t('logs.openOriginal')}
                        >
                          <ExternalLink size={16} aria-hidden="true" />
                        </span>
                        <button
                          type="button"
                          className="icon-button"
                          disabled
                          title={
                            row.secondary === 'flag' ? t('logs.reportWrong') : t('logs.blockUser')
                          }
                          aria-label={
                            row.secondary === 'flag' ? t('logs.reportWrong') : t('logs.blockUser')
                          }
                        >
                          {row.secondary === 'flag' ? (
                            <Flag size={16} aria-hidden="true" />
                          ) : (
                            <Ban size={16} aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="spam-log-footer">
          <p className="muted">{showing}</p>
          <div className="spam-pager">
            <button type="button" className="btn btn-secondary" disabled>
              {t('logs.prev')}
            </button>
            {totals ? (
              <>
                <button type="button" className="btn btn-primary" disabled aria-current="page">
                  1
                </button>
                <button type="button" className="btn btn-secondary" disabled>
                  2
                </button>
                <button type="button" className="btn btn-secondary" disabled>
                  3
                </button>
                <span aria-hidden="true">...</span>
                <button type="button" className="btn btn-secondary" disabled>
                  {Math.ceil(totals.logsTotal / 3)}
                </button>
              </>
            ) : null}
            <button type="button" className="btn btn-secondary" disabled>
              {t('logs.next')}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

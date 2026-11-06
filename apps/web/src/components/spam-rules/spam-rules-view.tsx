import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  SPAM_SAMPLE_HIDDEN,
  SPAM_SAMPLE_METRICS,
  SPAM_SAMPLE_RULES,
} from '../../lib/spam-rules-sample';
import { Icon, type IconName } from '../ui/icon';
import { Badge } from '../ui/tw-parts';
import { SpamHiddenLog } from './spam-hidden-log';
import { SpamRuleBuilder } from './spam-rule-builder';
import { SpamRuleList } from './spam-rule-list';
import { SpamRulesHeader } from './spam-rules-header';
import { SpamRulesMetrics } from './spam-rules-metrics';

export type SpamView = 'rules' | 'logs';

/** Đọc `?view=` từ URL: chỉ nhận `logs`, mọi giá trị khác về `rules` (mặc định). */
export function parseSpamView(value: string | string[] | undefined): SpamView {
  return value === 'logs' ? 'logs' : 'rules';
}

const TAB_BASE =
  'flex items-center gap-2 rounded-lg px-4 py-2 font-title-sm text-title-sm transition-all';
const SOON_BTN =
  'flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-surface-container-lowest px-3 py-1.5 font-label-sm text-label-sm text-on-surface opacity-70 shadow-sm';

function TabLink({
  href,
  current,
  icon,
  label,
  count,
}: {
  href: string;
  current: boolean;
  icon: IconName;
  label: string;
  count?: number;
}) {
  return (
    <a
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`${TAB_BASE} ${
        current
          ? 'bg-surface-container-lowest text-on-surface shadow-sm'
          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
      }`}
    >
      <span className={current ? 'text-primary-container' : ''}>
        <Icon name={icon} size={16} />
      </span>
      <span>{label}</span>
      {count === undefined ? null : <Badge tone={current ? 'primary' : 'strong'}>{count}</Badge>}
    </a>
  );
}

/**
 * Cả màn Quy tắc spam (Tailwind, design/stitch/spam-rules.html) dùng chung cho trang thật `/app/spam-rules` và trang
 * mẫu `/dev/ui/spam-rules`. `sample` = hiện dữ liệu mẫu `[MẪU]` (số liệu, danh sách quy tắc, nhật ký ẩn); false =
 * "—"/trạng thái trống. `basePath` dùng cho liên kết tab (`?view=logs`).
 */
export async function SpamRulesView({
  view,
  sample,
  basePath,
  notices,
}: {
  view: SpamView;
  sample: boolean;
  basePath: string;
  notices?: ReactNode;
}) {
  const t = await getTranslations('spamRules');
  const metrics = sample ? SPAM_SAMPLE_METRICS : null;
  return (
    <>
      <SpamRulesHeader
        activeRules={metrics?.activeRules ?? null}
        filtered7d={metrics?.filtered7d ?? null}
      />
      {notices}
      <SpamRulesMetrics data={metrics} />
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <nav
          aria-label={t('tabs.label')}
          className="flex items-center gap-2 rounded-xl bg-surface-container-low p-1 shadow-inner"
        >
          <TabLink
            href={basePath}
            current={view === 'rules'}
            icon="tune"
            label={t('tabs.rules')}
            count={metrics?.activeRules}
          />
          <TabLink
            href={`${basePath}?view=logs`}
            current={view === 'logs'}
            icon="restore_page"
            label={t('tabs.logs')}
            count={metrics?.logsTotal}
          />
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-disabled="true"
            tabIndex={-1}
            title={t('soonTitle')}
            className={SOON_BTN}
          >
            <Icon name="filter_list" size={14} />
            <span>{t('tabs.filter')}</span>
          </button>
          <button
            type="button"
            aria-disabled="true"
            tabIndex={-1}
            title={t('soonTitle')}
            className={SOON_BTN}
          >
            <Icon name="download" size={14} />
            <span>{t('tabs.export')}</span>
          </button>
        </div>
      </div>
      {view === 'rules' ? (
        <>
          <SpamRuleList rules={sample ? SPAM_SAMPLE_RULES : []} />
          <SpamRuleBuilder sample={sample} />
        </>
      ) : (
        <SpamHiddenLog rows={sample ? SPAM_SAMPLE_HIDDEN : []} totals={metrics} />
      )}
    </>
  );
}

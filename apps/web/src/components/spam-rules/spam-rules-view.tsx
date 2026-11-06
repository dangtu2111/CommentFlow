import { Download, Filter, History, SlidersHorizontal } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  SPAM_SAMPLE_HIDDEN,
  SPAM_SAMPLE_METRICS,
  SPAM_SAMPLE_RULES,
} from '../../lib/spam-rules-sample';
import { type TabItem, Tabs } from '../ui/tabs';
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

/**
 * Cả màn Quy tắc spam dùng chung cho trang thật `/app/spam-rules` và trang mẫu `/dev/ui/spam-rules`.
 * `sample` = hiện dữ liệu mẫu `[MẪU]` (số liệu, danh sách quy tắc, nhật ký ẩn); false = "—"/trạng thái trống.
 * `basePath` dùng cho liên kết tab (`?view=logs`).
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
  const tabs: TabItem[] = [
    {
      key: 'rules',
      href: basePath,
      label: t('tabs.rules'),
      current: view === 'rules',
      icon: <SlidersHorizontal size={16} />,
      badge: metrics?.activeRules,
    },
    {
      key: 'logs',
      href: `${basePath}?view=logs`,
      label: t('tabs.logs'),
      current: view === 'logs',
      icon: <History size={16} />,
      badge: metrics?.logsTotal,
    },
  ];
  return (
    <>
      <SpamRulesHeader
        activeRules={metrics?.activeRules ?? null}
        filtered7d={metrics?.filtered7d ?? null}
      />
      {notices}
      <SpamRulesMetrics data={metrics} />
      <div className="spam-tabs-row">
        <Tabs items={tabs} label={t('tabs.label')} variant="toolbar" />
        <div className="spam-tabs-actions">
          <button type="button" className="btn btn-secondary" disabled title={t('soonTitle')}>
            <Filter size={14} aria-hidden="true" />
            {t('tabs.filter')}
          </button>
          <button type="button" className="btn btn-secondary" disabled title={t('soonTitle')}>
            <Download size={14} aria-hidden="true" />
            {t('tabs.export')}
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

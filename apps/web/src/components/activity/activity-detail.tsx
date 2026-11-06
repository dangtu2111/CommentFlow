import { isLocale } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { actionLabelKey, diffRows } from '../../lib/action-log-format';
import { ACTIVITY_INSPECTOR_SAMPLE as S } from '../../lib/activity-sample';
import { formatAbsoluteTime } from '../../lib/inbox-format';
import { Icon } from '../ui/icon';
import { Badge, SoonButton } from '../ui/tw-parts';
import { type ActivityListItem, actorDisplay } from './activity-list';

export type ActivityDetail = ActivityListItem & {
  targetId: string | null;
  before: unknown;
  after: unknown;
};

const DASH = '—';
const LABEL = 'font-label-sm text-label-sm text-on-surface-variant';
const SECTION =
  'font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant';

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className={LABEL}>{label}</span>
      {children}
    </div>
  );
}

/**
 * Ngăn kiểm tra sự kiện (design/stitch/activity-log.html): thẻ thông tin, quy tắc kích hoạt, biến động trạng thái
 * (trước/sau THẬT từ `action_logs`), vết Meta Graph, nút hành động. Quy tắc/vết Graph chưa có nguồn → `[MẪU]` (dev)
 * hoặc "—"; nút "Sắp có".
 */
export async function ActivityDetailPanel({
  entry,
  timeZone,
  viewerId,
  sample,
}: {
  entry: ActivityDetail;
  timeZone: string;
  viewerId: string;
  sample: boolean;
}) {
  const [t, rawLocale] = await Promise.all([getTranslations('activity'), getLocale()]);
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';
  const soon = t('ui.soon');
  const key = actionLabelKey(entry.action);
  const rows = diffRows(entry.before, entry.after);
  const sampleRef = sample && entry.sample ? S : null;
  return (
    <article className="flex w-full shrink-0 flex-col space-y-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm xl:w-[420px]">
      <div className="flex items-center justify-between pb-space-sm">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              {key ? t(`actions.${key as 'workspace_created'}`) : entry.action}
            </h2>
            {sampleRef ? <Badge tone="neutral">{t('ui.sampleTag')}</Badge> : null}
          </div>
          <p className={LABEL}>
            <code>{entry.action}</code>
          </p>
        </div>
        <SoonButton
          variant="icon"
          soon={soon}
          label={t('ui.inspector.close')}
          className="bg-surface-container-low p-1.5"
        >
          <Icon name="close" size={16} />
        </SoonButton>
      </div>

      <div className="space-y-space-sm rounded-lg bg-surface-container-low p-space-md text-on-surface">
        <MetaRow label={t('detail.time')}>
          <span className="font-title-sm text-title-sm font-semibold">
            {formatAbsoluteTime(entry.createdAt, locale, timeZone)}
          </span>
        </MetaRow>
        <MetaRow label={t('detail.actor')}>
          <span className="inline-flex items-center gap-1 font-title-sm text-title-sm font-semibold text-secondary">
            {entry.actorType === 'ai' ? <Icon name="smart_toy" size={14} /> : null}
            {actorDisplay(t, entry, viewerId)}
          </span>
        </MetaRow>
        <MetaRow label={t('detail.target')}>
          <span className="font-title-sm text-title-sm">
            {entry.targetType ?? DASH}
            {entry.targetId ? ` · ${entry.targetId}` : ''}
          </span>
        </MetaRow>
        <MetaRow label={t('ui.inspector.channel')}>
          <span className="font-title-sm text-title-sm">{sampleRef?.channel ?? DASH}</span>
        </MetaRow>
        <MetaRow label={t('ui.inspector.commentId')}>
          <span className="font-label-md text-label-md text-primary">
            {sampleRef?.commentId ?? DASH}
          </span>
        </MetaRow>
      </div>

      <div className="space-y-1 rounded-lg bg-surface-container-high p-space-md">
        <div className="flex items-center gap-1.5 font-title-sm text-title-sm text-on-surface">
          <span className="text-tertiary">
            <Icon name="security" size={16} />
          </span>
          <span>{t('ui.inspector.rule', { rule: sampleRef?.rule ?? DASH })}</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {sampleRef?.ruleText ?? DASH}
        </p>
      </div>

      <div className="space-y-space-xs">
        <span className={SECTION}>{t('detail.changes')}</span>
        <div className="space-y-space-sm rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm">
          {rows.length === 0 ? (
            <p className="text-on-surface-variant">{t('detail.noChanges')}</p>
          ) : (
            rows.map((row) => (
              <div key={row.key}>
                <span className="block font-label-sm text-label-sm text-on-surface-variant">
                  {row.key}:
                </span>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-on-surface-variant line-through">
                    {row.before ?? t('detail.none')}
                  </span>
                  <span className="text-primary">
                    <Icon name="arrow_forward" size={12} />
                  </span>
                  <span
                    className={
                      row.changed ? 'font-semibold text-error' : 'font-semibold text-on-surface'
                    }
                  >
                    {row.after ?? t('detail.none')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-space-xs">
        <div className="flex items-center justify-between">
          <span className={SECTION}>{t('ui.inspector.trace')}</span>
          <SoonButton variant="link" soon={soon} className="gap-1 font-normal">
            <Icon name="content_copy" size={12} />
            {t('ui.inspector.copyJson')}
          </SoonButton>
        </div>
        <div className="space-y-1 overflow-x-auto rounded-lg bg-inverse-surface p-space-md font-code-sm text-code-sm text-inverse-on-surface">
          {sampleRef ? (
            <>
              <div className="text-primary-fixed">{sampleRef.traceRequest}</div>
              <div className="text-outline-variant">{sampleRef.traceBody}</div>
              <div className="font-semibold text-surface-container-lowest">
                {sampleRef.traceResponse}
              </div>
              <div className="text-outline-variant">{sampleRef.traceResult}</div>
            </>
          ) : (
            <div className="text-outline-variant">{t('ui.inspector.noTrace')}</div>
          )}
        </div>
      </div>

      <div className="space-y-space-xs pt-space-sm">
        <SoonButton variant="primary" soon={soon} className="w-full px-3 shadow-sm">
          <Icon name="open_in_new" size={16} />
          <span>{t('ui.inspector.openComment')}</span>
        </SoonButton>
        <SoonButton variant="neutral" soon={soon} className="w-full shadow-none">
          <Icon name="person_search" size={16} />
          <span>{t('ui.inspector.viewLead', { code: sampleRef?.leadCode ?? DASH })}</span>
        </SoonButton>
      </div>
    </article>
  );
}

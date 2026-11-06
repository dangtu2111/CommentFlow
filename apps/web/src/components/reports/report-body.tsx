import type { Report } from '@flow/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  formatDuration,
  formatPercent,
  REPORT_RANGES,
  type ReportRange,
} from '../../lib/report-view';
import { KPI_SAMPLE, STAFF_SAMPLE, TOP_POSTS_SAMPLE } from '../../lib/reports-sample';
import { Icon } from '../ui/icon';
import { Badge, Meter, Panel, SoonButton } from '../ui/tw-parts';
import { HourlyChart } from './hourly-chart';
import { InsightCard } from './insight-card';
import { IntentCard } from './intent-card';
import { KpiTile } from './kpi-tile';
import { TrendCard } from './trend-card';

const DASH = '—';

/** Đầu trang Báo cáo (design/stitch/reports.html §1): tiêu đề + chọn khoảng ngày (liên kết GET) + bộ lọc/xuất (Sắp có). */
export async function ReportHead({
  days,
  isOwner,
  sample,
}: {
  days: ReportRange;
  isOwner: boolean;
  sample: boolean;
}) {
  const t = await getTranslations('reports');
  const soon = t('ui.soon');
  return (
    <Panel
      size="lg"
      className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center rounded-lg bg-surface-container p-1.5 text-primary">
            <Icon name="insights" size={18} />
          </span>
          <h1 className="font-headline-sm text-headline-sm text-on-surface">{t('title')}</h1>
          <Badge tone="secondary" className="uppercase tracking-wider">
            <Icon name="auto_awesome" size={12} />
            {t('ui.badge')}
          </Badge>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {isOwner ? t('subtitle.owner') : t('subtitle.staff')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-space-sm">
        <nav
          className="flex items-center rounded-lg bg-surface-container-low p-1"
          aria-label={t('range.label')}
        >
          <span
            aria-disabled="true"
            title={soon}
            className="cursor-not-allowed rounded px-3 py-1.5 font-title-sm text-title-sm text-on-surface-variant opacity-70"
          >
            {t('ui.today')}
          </span>
          {REPORT_RANGES.map((d) => (
            <Link
              key={d}
              href={`/app/reports?range=${d}`}
              aria-current={d === days ? 'true' : undefined}
              className={
                d === days
                  ? 'rounded bg-surface-container-lowest px-3 py-1.5 font-title-sm text-title-sm text-primary shadow-sm'
                  : 'rounded px-3 py-1.5 font-title-sm text-title-sm text-on-surface-variant transition-colors hover:text-on-surface'
              }
            >
              {t('range.days', { days: d })}
            </Link>
          ))}
          <span
            aria-disabled="true"
            title={soon}
            className="flex cursor-not-allowed items-center gap-1 rounded px-3 py-1.5 font-title-sm text-title-sm text-on-surface-variant opacity-70"
          >
            <Icon name="calendar_today" size={12} />
            {sample ? KPI_SAMPLE.range : t('ui.customRange')}
          </span>
        </nav>
        <SoonButton variant="neutral" soon={soon} className="gap-2 px-3 py-1.5">
          <Icon name="filter_alt" size={14} />
          <span>{t('ui.allChannels')}</span>
          <Icon name="expand_more" size={14} />
        </SoonButton>
        <div className="hidden h-6 w-px bg-surface-container-high sm:block" />
        <div className="flex items-center gap-2">
          <label
            className="hidden cursor-not-allowed select-none items-center gap-2 rounded-lg bg-surface-container-low px-3 py-1.5 opacity-70 xl:flex"
            title={soon}
          >
            <input
              type="checkbox"
              disabled
              className="h-3.5 w-3.5 cursor-not-allowed rounded accent-primary-container"
            />
            <span className="font-label-sm text-label-sm text-on-surface">
              {t('ui.weeklyEmail')}
            </span>
          </label>
          <SoonButton variant="soft" soon={soon}>
            <Icon name="download" size={14} />
            <span>{t('ui.exportExcel')}</span>
          </SoonButton>
          <SoonButton
            variant="primary"
            soon={soon}
            label={t('ui.refresh')}
            className="p-2 shadow-sm"
          >
            <Icon name="refresh" size={14} />
          </SoonButton>
        </div>
      </div>
    </Panel>
  );
}

function PersonalAwareValue({ value }: { value: string | number | null }) {
  return <>{value ?? DASH}</>;
}

/** Thân báo cáo (§2–§5 của HTML) từ `Report` đã tính; khối chưa có nguồn thật hiện `[MẪU]` (dev) hoặc "—". */
export async function ReportBody({
  report,
  truncated,
  sample,
}: {
  report: Report;
  truncated: boolean;
  sample: boolean;
}) {
  const t = await getTranslations('reports');
  const personal = report.scope === 'personal';
  const soon = t('ui.soon');
  const mock = (value: string | number) => (sample ? value : DASH);
  const aiRate =
    !personal && report.received > 0
      ? formatPercent((report.autoReplied ?? 0) / report.received)
      : null;
  const hours = personal ? null : Number((report.hoursSaved ?? 0).toFixed(1));
  const tag = sample ? <Badge tone="neutral">{t('ui.sampleTag')}</Badge> : null;
  return (
    <>
      {truncated ? (
        <div
          role="alert"
          className="rounded-xl bg-error-container p-space-md font-body-md text-body-md text-on-error-container"
        >
          {t('truncated')}
        </div>
      ) : null}
      <section
        className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-5"
        aria-label={t('kpi.label')}
      >
        <KpiTile
          label={personal ? t('kpi.answered') : t('ui.kpi.total')}
          icon="mark_chat_read"
          value={personal ? report.answered : report.received}
          detail={
            <>
              <span>
                {t('ui.kpi.comments')}:{' '}
                <b className="font-semibold text-on-surface">{report.received}</b>
              </span>
              <span>•</span>
              <span>
                {t('ui.kpi.messages')}:{' '}
                <b className="font-semibold text-on-surface">{mock(KPI_SAMPLE.messages)}</b>
              </span>
            </>
          }
          footer={
            <div className="flex items-center gap-1.5 font-label-sm text-label-sm text-primary">
              <Icon name="trending_up" size={12} />
              <span className="font-semibold">{mock(KPI_SAMPLE.totalDelta)}</span>
              <span className="font-normal text-on-surface-variant">{t('ui.kpi.vsLast')}</span>
            </div>
          }
        />
        <KpiTile
          tone="secondary"
          label={t('ui.kpi.aiRate')}
          icon="smart_toy"
          value={<PersonalAwareValue value={aiRate} />}
          detail={<span>{t('ui.kpi.aiRateNote')}</span>}
          footer={
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 font-label-sm text-label-sm font-semibold text-secondary">
                <Icon name="trending_up" size={12} />
                <span>{mock(KPI_SAMPLE.aiDelta)}</span>
              </div>
              <Badge tone="secondary">{t('ui.kpi.safe')}</Badge>
            </div>
          }
        />
        <KpiTile
          label={t('kpi.median')}
          icon="schedule"
          value={formatDuration(report.medianResponseMs)}
          detail={
            <span className="line-through opacity-75">
              {t('ui.kpi.beforeAi', { time: mock(KPI_SAMPLE.beforeAi) })}
            </span>
          }
          footer={
            <div className="flex items-center gap-1.5 font-label-sm text-label-sm font-semibold text-primary">
              <Icon name="bolt" size={12} />
              <span>{t('ui.kpi.waitCut', { pct: mock(KPI_SAMPLE.waitCut) })}</span>
            </div>
          }
        />
        <KpiTile
          tone="tertiary"
          label={t('ui.kpi.hoursSaved')}
          icon="savings"
          value={hours === null ? DASH : t('ui.kpi.hours', { hours })}
          detail={<span>{t('ui.kpi.fte', { fte: mock(KPI_SAMPLE.fteEquivalent) })}</span>}
          footer={
            <div className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
              <Icon name="payments" size={12} />
              <span>
                {t('ui.kpi.savedMoney')}{' '}
                <b className="text-on-surface">{mock(KPI_SAMPLE.savedMoney)}</b>
              </span>
            </div>
          }
        />
        <KpiTile
          label={t('ui.kpi.leads')}
          icon="contact_phone"
          value={mock(KPI_SAMPLE.leads)}
          detail={<span>{t('ui.kpi.leadsNote')}</span>}
          footer={
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm font-semibold text-primary">
                {t('ui.kpi.conversion', { pct: mock(KPI_SAMPLE.conversion) })}
              </span>
              <Badge tone="neutral" className="text-on-surface">
                {t('ui.kpi.leadsWeek', { n: mock(KPI_SAMPLE.leadsWeek) })}
              </Badge>
            </div>
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-space-md lg:grid-cols-12">
        <TrendCard sample={sample} />
        <IntentCard sample={sample} />
      </div>

      <Panel size="lg" className="space-y-space-md" id="report-hourly">
        <div>
          <h2 className="font-title-md text-title-md font-semibold text-on-surface">
            {t('hourly.title')}
          </h2>
          <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
            {t('hourly.description')}
          </p>
        </div>
        <HourlyChart distribution={report.hourlyDistribution} peakHours={report.peakHours} />
      </Panel>

      <div className="grid grid-cols-1 gap-space-md xl:grid-cols-12">
        <Panel size="lg" className="flex flex-col justify-between space-y-space-md xl:col-span-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-surface-container p-1.5 text-primary">
                <Icon name="campaign" size={16} />
              </div>
              <div>
                <h3 className="flex items-center gap-2 font-title-md text-title-md font-semibold text-on-surface">
                  {t('ui.posts.title')} {tag}
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {t('ui.posts.subtitle')}
                </p>
              </div>
            </div>
            <SoonButton variant="link" soon={soon}>
              {t('ui.posts.all')}
            </SoonButton>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant">
                  <th className="rounded-l-lg px-3 py-2.5">{t('ui.posts.colPost')}</th>
                  <th className="px-3 py-2.5">{t('ui.posts.colProduct')}</th>
                  <th className="px-3 py-2.5 text-center">{t('ui.posts.colQuestions')}</th>
                  <th className="px-3 py-2.5">{t('ui.posts.colAuto')}</th>
                  <th className="rounded-r-lg px-3 py-2.5 text-right">{t('ui.posts.colAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-transparent font-body-sm text-body-sm">
                {sample ? (
                  TOP_POSTS_SAMPLE.map((post) => {
                    const warn = post.product === null;
                    return (
                      <tr
                        key={post.title}
                        className={
                          warn
                            ? 'bg-error-container/20 transition-colors hover:bg-error-container/30'
                            : 'transition-colors hover:bg-surface-container-low'
                        }
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-9 w-9 shrink-0 rounded-lg bg-surface-container-high" />
                            <div className="min-w-0">
                              <div className="truncate font-title-sm text-title-sm text-on-surface">
                                {post.title}
                              </div>
                              <div
                                className={
                                  warn
                                    ? 'flex items-center gap-1 font-label-sm text-label-sm font-medium text-error'
                                    : 'flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant'
                                }
                              >
                                {warn ? (
                                  <Icon name="warning" size={12} />
                                ) : (
                                  <span
                                    className={
                                      post.channelTone === 'primary'
                                        ? 'h-1.5 w-1.5 rounded-full bg-primary-container'
                                        : 'h-1.5 w-1.5 rounded-full bg-secondary'
                                    }
                                  />
                                )}
                                <span>{post.channel}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {warn ? (
                            <Badge tone="error" variant="box" className="px-2">
                              <Icon name="link_off" size={12} />
                              {t('ui.posts.unlinked')}
                            </Badge>
                          ) : (
                            <span className="inline-block max-w-[140px] truncate rounded bg-surface-container px-2 py-1 font-label-sm text-label-sm text-on-surface">
                              {post.product}
                            </span>
                          )}
                        </td>
                        <td
                          className={
                            warn
                              ? 'px-3 py-3 text-center font-title-sm text-title-sm font-bold text-error'
                              : 'px-3 py-3 text-center font-title-sm text-title-sm font-semibold text-on-surface'
                          }
                        >
                          {post.priceQuestions}
                        </td>
                        <td className="px-3 py-3">
                          {post.autoPct === null ? (
                            <span className="font-label-sm text-label-sm italic text-on-surface-variant">
                              {t('ui.posts.allHuman')}
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Meter pct={post.autoPct} className="w-16" />
                              <span className="font-label-sm text-label-sm font-semibold text-primary">
                                {post.autoPct}%
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <SoonButton
                            variant={warn ? 'primary' : 'mini'}
                            soon={soon}
                            className={
                              warn
                                ? 'rounded px-2.5 py-1 font-label-sm text-label-sm shadow-sm'
                                : undefined
                            }
                          >
                            {warn ? t('ui.posts.linkNow') : t('ui.posts.viewPage')}
                          </SoonButton>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-on-surface-variant">
                      {t('ui.posts.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between pt-2 font-body-sm text-body-sm text-on-surface-variant">
            <span>{t('ui.posts.footer')}</span>
            <SoonButton variant="link" soon={soon}>
              {t('ui.posts.bulkLink')}
            </SoonButton>
          </div>
        </Panel>

        {personal ? null : (
          <Panel size="lg" className="flex flex-col justify-between space-y-space-md xl:col-span-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-surface-container p-1.5 text-primary">
                  <Icon name="badge" size={16} />
                </div>
                <div>
                  <h3 className="font-title-md text-title-md font-semibold text-on-surface">
                    {t('staff.title')}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {t('ui.staff.subtitle')}
                  </p>
                </div>
              </div>
              <Badge tone="neutral">
                {t('ui.staff.count', {
                  n:
                    report.perStaff.length > 0
                      ? report.perStaff.length
                      : mock(KPI_SAMPLE.staffCount),
                })}
              </Badge>
            </div>
            <div className="space-y-space-sm">
              {report.perStaff.length > 0 ? (
                report.perStaff.map((row, index) => (
                  <div
                    key={row.userId}
                    className="flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm transition-colors hover:bg-surface-container"
                  >
                    <div>
                      <div className="font-title-sm text-title-sm text-on-surface">
                        {t('staff.member', { n: index + 1 })}
                      </div>
                      <div className="font-label-sm text-label-sm text-on-surface-variant">
                        {t('ui.staff.summary', {
                          answered: row.answered,
                          median: formatDuration(row.medianResponseMs),
                        })}
                      </div>
                    </div>
                    <div className="text-right font-label-sm text-label-sm font-semibold text-on-surface">
                      {t('staff.columns.within15')}: {formatPercent(row.within15Rate)}
                    </div>
                  </div>
                ))
              ) : sample ? (
                STAFF_SAMPLE.map((member) => (
                  <div
                    key={member.name}
                    className="flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm transition-colors hover:bg-surface-container"
                  >
                    <div className="flex items-center gap-space-sm">
                      <div className="relative">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-surface-container-high" />
                        <span
                          className={
                            member.online
                              ? 'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-primary-container'
                              : 'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-outline'
                          }
                        />
                      </div>
                      <div>
                        <div className="font-title-sm text-title-sm text-on-surface">
                          {member.name}
                        </div>
                        <div className="font-label-sm text-label-sm text-on-surface-variant">
                          {member.summary}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-label-sm text-label-sm font-semibold text-on-surface">
                        {member.editRate}
                      </div>
                      <span
                        className={
                          member.trustTone === 'primary'
                            ? 'font-label-sm text-label-sm text-primary'
                            : member.trustTone === 'tertiary'
                              ? 'font-label-sm text-label-sm text-tertiary'
                              : 'font-label-sm text-label-sm text-on-surface-variant'
                        }
                      >
                        {member.trust}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-lg bg-surface-container-low p-space-sm font-body-sm text-body-sm text-on-surface-variant">
                  {t('staff.empty')}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface-container-highest/60 p-space-sm">
              <div className="flex items-center gap-2">
                <span className="text-secondary">
                  <Icon name="trending_up" size={14} />
                </span>
                <span className="font-label-sm text-label-sm text-on-surface">
                  {t('ui.staff.agreement')}{' '}
                  <b className="font-bold text-secondary">{mock(KPI_SAMPLE.agreement)}</b>
                </span>
              </div>
              <SoonButton variant="link" soon={soon}>
                {t('ui.staff.permissions')}
              </SoonButton>
            </div>
          </Panel>
        )}
      </div>

      <InsightCard sample={sample} />
    </>
  );
}

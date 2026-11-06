import type { Report } from '@flow/shared';
import { Clock, Users } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  formatDuration,
  formatPercent,
  REPORT_RANGES,
  type ReportRange,
} from '../../lib/report-view';
import { Banner } from '../ui/banner';
import { Card } from '../ui/card';
import { DataTable } from '../ui/data-table';
import { PageHeader } from '../ui/page-header';
import { SectionHead } from '../ui/section-head';
import { Stat } from '../ui/stat';
import { HourlyChart } from './hourly-chart';

const HOURLY_ID = 'report-hourly-title';
const STAFF_ID = 'report-staff-title';

/** Đầu trang Báo cáo: tiêu đề + chọn khoảng ngày (liên kết GET, không cần JavaScript). */
export async function ReportHead({ days, isOwner }: { days: ReportRange; isOwner: boolean }) {
  const t = await getTranslations('reports');
  return (
    <div className="report-head">
      <PageHeader
        title={t('title')}
        subtitle={isOwner ? t('subtitle.owner') : t('subtitle.staff')}
      />
      <nav className="report-range" aria-label={t('range.label')}>
        {REPORT_RANGES.map((d) => (
          <Link
            key={d}
            href={`/app/reports?range=${d}`}
            aria-current={d === days ? 'true' : undefined}
          >
            {t('range.days', { days: d })}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Thân báo cáo (số liệu, biểu đồ giờ, năng suất nhân viên) từ `Report` đã tính — dùng chung trang thật và mẫu dev. */
export async function ReportBody({ report, truncated }: { report: Report; truncated: boolean }) {
  const t = await getTranslations('reports');
  const personal = report.scope === 'personal';
  return (
    <>
      {truncated ? <Banner variant="warning">{t('truncated')}</Banner> : null}
      <div className="info-tiles" aria-label={t('kpi.label')}>
        <Stat
          label={personal ? t('kpi.answered') : t('kpi.received')}
          value={personal ? report.answered : report.received}
        />
        {personal ? null : (
          <Stat
            label={t('kpi.answerRate')}
            value={formatPercent(report.answerRate)}
            note={t('kpi.answeredOf', { answered: report.answered, received: report.received })}
          />
        )}
        <Stat label={t('kpi.within15')} value={formatPercent(report.within15Rate)} />
        <Stat label={t('kpi.median')} value={formatDuration(report.medianResponseMs)} />
        {personal ? null : (
          <Stat
            label={t('kpi.autoReplied')}
            value={report.autoReplied ?? 0}
            note={t('kpi.hoursSaved', { hours: Number((report.hoursSaved ?? 0).toFixed(1)) })}
            noteOk
          />
        )}
      </div>
      <Card aria-labelledby={HOURLY_ID}>
        <SectionHead
          id={HOURLY_ID}
          icon={<Clock size={20} />}
          title={t('hourly.title')}
          description={t('hourly.description')}
        />
        <HourlyChart distribution={report.hourlyDistribution} peakHours={report.peakHours} />
      </Card>
      {personal ? null : (
        <Card aria-labelledby={STAFF_ID}>
          <SectionHead
            id={STAFF_ID}
            icon={<Users size={20} />}
            title={t('staff.title')}
            description={t('staff.description')}
          />
          {report.perStaff.length === 0 ? (
            <p className="muted">{t('staff.empty')}</p>
          ) : (
            <DataTable
              label={t('staff.title')}
              columns={[
                { label: t('staff.columns.who') },
                { label: t('staff.columns.answered'), end: true },
                { label: t('staff.columns.within15'), end: true },
                { label: t('staff.columns.median'), end: true },
              ]}
            >
              {report.perStaff.map((row, index) => (
                <tr key={row.userId}>
                  <td>{t('staff.member', { n: index + 1 })}</td>
                  <td className="data-table-end">{row.answered}</td>
                  <td className="data-table-end">{formatPercent(row.within15Rate)}</td>
                  <td className="data-table-end">{formatDuration(row.medianResponseMs)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}
    </>
  );
}

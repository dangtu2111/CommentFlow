import type { Report } from '@flow/shared';
import { notFound } from 'next/navigation';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { ReportBody, ReportHead } from '../../../../components/reports/report-body';
import { TwPage } from '../../../../components/ui/tw-parts';

const HOURLY = [
  2, 1, 0, 0, 1, 3, 8, 21, 34, 41, 33, 27, 22, 25, 29, 31, 26, 30, 38, 44, 47, 36, 18, 7,
];

const REPORT: Report = {
  scope: 'workspace',
  from: '2026-10-30T00:00:00.000Z',
  to: '2026-11-06T00:00:00.000Z',
  received: 526,
  answered: 431,
  answerRate: 431 / 526,
  within15Rate: 0.684,
  medianResponseMs: 72_000,
  autoReplied: 205,
  hoursSaved: 6.8,
  hourlyDistribution: HOURLY,
  peakHours: [19, 20, 9],
  perStaff: [],
};

/** Giao diện Báo cáo với DỮ LIỆU MẪU — chỉ khi `NODE_ENV !== 'production'`; dùng đúng `ReportBody` của trang thật. */
export default function DevReportsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <DevShell>
      <TwPage>
        <p className="font-label-md text-label-md text-on-surface-variant" role="note">
          {DEV_SAMPLE_NOTE}
        </p>
        <ReportHead days={30} isOwner sample />
        <ReportBody report={REPORT} truncated={false} sample />
      </TwPage>
    </DevShell>
  );
}

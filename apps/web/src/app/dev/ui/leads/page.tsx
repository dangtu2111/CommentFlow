import type { LeadRow } from '@flow/db/runtime';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { LeadsView } from '../../../../components/leads/leads-view';
import { PageHeader } from '../../../../components/ui/page-header';

const NOW = Date.now();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000);

const lead = (n: number, stage: LeadRow['stage'], patch: Partial<LeadRow> = {}): LeadRow => ({
  id: `sample-${n}`,
  channelId: 'sample-channel',
  sourceType: n % 2 === 0 ? 'message' : 'comment',
  sourceId: null,
  name: `[MẪU] Khách ${n}`,
  phoneLast4: String(1000 + n * 37).slice(-4),
  hasEmail: n % 3 === 0,
  note: null,
  stage,
  assignedTo: null,
  createdAt: ago(n * 47),
  updatedAt: ago(n * 47),
  ...patch,
});

const LEADS: LeadRow[] = [
  lead(1, 'new'),
  lead(2, 'new', { name: null }),
  lead(3, 'new', { assignedTo: 'u1' }),
  lead(4, 'contacted', { note: '[MẪU] Khách phân vân size, hẹn gọi lại chiều nay.' }),
  lead(5, 'contacted'),
  lead(6, 'won'),
  lead(7, 'won'),
];

/** Giao diện Khách tiềm năng với DỮ LIỆU MẪU — chỉ khi `NODE_ENV !== 'production'`; dùng đúng `LeadsView` của trang thật. */
export default async function DevLeadsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const t = await getTranslations('leads');
  return (
    <DevShell>
      <main className="app-page app-page-wide stack">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <p className="inbox-sample-note" role="note">
          {DEV_SAMPLE_NOTE}
        </p>
        <LeadsView leads={LEADS} counts={{ new: 3, contacted: 2, won: 2, lost: 0 }} />
      </main>
    </DevShell>
  );
}

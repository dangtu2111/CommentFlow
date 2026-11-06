import { notFound } from 'next/navigation';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { BillingView } from '../../../../components/settings/billing-view';
import { SettingsFrame } from '../../../../components/settings/settings-frame';
import type { InvoiceListRow } from '../../../../lib/billing-view';
import { buildUsageMeterView } from '../../../../lib/usage-meter-view';

const INVOICES: InvoiceListRow[] = [
  {
    id: 'm1',
    number: '[MẪU] INV-0003',
    dateIso: '2026-10-28',
    description: '[MẪU] Gói Growth (tháng 10)',
    amountVnd: 699_000,
    status: 'paid',
    statusKey: 'paid',
    tone: 'success',
  },
  {
    id: 'm2',
    number: '[MẪU] INV-0002',
    dateIso: '2026-10-12',
    description: '[MẪU] +1.000 lượt AI (add-on)',
    amountVnd: 149_000,
    status: 'pending',
    statusKey: 'awaiting',
    tone: 'warning',
  },
  {
    id: 'm3',
    number: '[MẪU] INV-0001',
    dateIso: '2026-09-28',
    description: '[MẪU] Gói Growth (tháng 9)',
    amountVnd: 699_000,
    status: 'void',
    statusKey: 'void',
    tone: 'muted',
  },
];

/**
 * Trang xem Gói & Thanh toán với DỮ LIỆU MẪU — chỉ khi `NODE_ENV !== 'production'` (UI-first 06/11/2026).
 * `?state=unknown` xem trạng thái chưa có thông tin gói (giống trang thật hiện nay).
 */
export default async function DevBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const unknown = params.state === 'unknown';
  return (
    <DevShell>
      <p className="inbox-sample-note" role="note">
        {DEV_SAMPLE_NOTE}
      </p>
      <main className="app-page app-page-settings">
        <SettingsFrame
          viewerRole="owner"
          active="billing"
          counts={{ channelsConnected: 3, channelsTotal: 3, members: 5 }}
        >
          <BillingView
            currentPlan={unknown ? null : 'growth'}
            usage={buildUsageMeterView({ used: 2450, limit: 3000 })}
            invoices={unknown ? [] : INVOICES}
          />
        </SettingsFrame>
      </main>
    </DevShell>
  );
}

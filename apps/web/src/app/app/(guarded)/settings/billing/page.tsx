import { listInvoices } from '@flow/db/runtime';
import { getTranslations } from 'next-intl/server';
import { BillingView } from '../../../../../components/settings/billing-view';
import { SettingsFrame } from '../../../../../components/settings/settings-frame';
import { buildInvoiceRows } from '../../../../../lib/billing-view';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';
import { loadSettingsCounts } from '../../../../../server/settings-counts';
import { loadUsageMeterView } from '../../../../../server/usage-meter';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('settings'), getTranslations('shell')]);
  return { title: `${t('billing.title')} · ${tb('brand')}` };
}

/**
 * Gói & Thanh toán (FR-090, FR-091; Stitch `settings-billing`): CHỈ Owner. Đọc đồng hồ lượt AI và hóa đơn thật
 * (hóa đơn qua `withActor`: RLS chỉ Owner). Chưa có bảng `plans`/đăng ký gói (`PLANS-SCHEMA`) nên không biết gói hiện
 * tại (`currentPlan={null}`). Không gọi dịch vụ thanh toán.
 */
export default async function BillingPage() {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [usage, invoices, counts] = await Promise.all([
    loadUsageMeterView(workspace.id),
    getDb().withActor(workspace.id, user.id, (tx) => listInvoices(tx, workspace.id, 50)),
    loadSettingsCounts({ role: workspace.role, workspaceId: workspace.id, userId: user.id }),
  ]);
  return (
    <main className="app-page app-page-settings">
      <SettingsFrame viewerRole={workspace.role} active="billing" counts={counts}>
        <BillingView currentPlan={null} usage={usage} invoices={buildInvoiceRows(invoices)} />
      </SettingsFrame>
    </main>
  );
}

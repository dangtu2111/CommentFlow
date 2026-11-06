import { listInvoices } from '@flow/db/runtime';
import { getTranslations } from 'next-intl/server';
import { BillingView } from '../../../../../components/settings/billing-view';
import { SettingsFrame } from '../../../../../components/settings/settings-frame';
import { buildInvoiceRows } from '../../../../../lib/billing-view';
import { getDb } from '../../../../../server/db';
import {
  defaultPaymentDeps,
  loadPaymentCard,
  type PaymentCard,
} from '../../../../../server/invoice-payment';
import { requireAppUser } from '../../../../../server/require-app-user';
import { loadSettingsCounts } from '../../../../../server/settings-counts';
import { loadUsageMeterView } from '../../../../../server/usage-meter';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('settings'), getTranslations('shell')]);
  return { title: `${t('billing.title')} · ${tb('brand')}` };
}

/** Lỗi đọc/dựng QR không được làm hỏng cả trang Cài đặt: coi như "chưa sẵn sàng". */
async function safePaymentCard(workspaceId: string, userId: string): Promise<PaymentCard> {
  try {
    return await loadPaymentCard(defaultPaymentDeps(getDb()), { workspaceId, userId });
  } catch (error) {
    console.error('payment.card_failed', {
      workspaceId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return { state: 'unavailable' };
  }
}

/**
 * Gói & Thanh toán (FR-090, FR-091; Stitch `settings-billing`): CHỈ Owner. Đọc đồng hồ lượt AI và hóa đơn thật
 * (hóa đơn qua `withActor`: RLS chỉ Owner). Chưa có bảng `plans`/đăng ký gói (`PLANS-SCHEMA`) nên không biết gói hiện
 * tại (`currentPlan={null}`). QR chuyển khoản (QR-PAYMENT) chỉ hiện khi `QR_PAYMENT_ENABLED=true` và đã cấu hình tài
 * khoản nhận tiền; không gọi dịch vụ thanh toán nào.
 */
export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [usage, invoices, counts, payment, params] = await Promise.all([
    loadUsageMeterView(workspace.id),
    getDb().withActor(workspace.id, user.id, (tx) => listInvoices(tx, workspace.id, 50)),
    loadSettingsCounts({ role: workspace.role, workspaceId: workspace.id, userId: user.id }),
    safePaymentCard(workspace.id, user.id),
    searchParams,
  ]);
  const notice =
    params.payment === 'reported' || params.payment === 'error' ? params.payment : null;
  return (
    <main className="app-page app-page-settings">
      <SettingsFrame viewerRole={workspace.role} active="billing" counts={counts}>
        <BillingView
          currentPlan={null}
          usage={usage}
          invoices={buildInvoiceRows(invoices)}
          payment={payment}
          paymentNotice={notice}
        />
      </SettingsFrame>
    </main>
  );
}

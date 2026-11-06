import { getTranslations } from 'next-intl/server';
import { reportTransferAction } from '../../app/app/(guarded)/settings/billing/actions';
import { formatVnd } from '../../lib/plan-catalog';
import type { PaymentCard } from '../../server/invoice-payment';

type ReadyCard = Extract<PaymentCard, { state: 'ready' }>;

/**
 * Thẻ QR chuyển khoản của hóa đơn đang chờ (FR-091, US-061; component `QRPaymentCard` docs/08). Chỉ trình bày: số
 * tiền, nội dung, tài khoản và ảnh QR do server dựng từ hóa đơn trong DB. Nút "Tôi đã chuyển khoản" chỉ đánh dấu
 * "chờ xác nhận" — chưa phải đã thanh toán.
 */
export async function PaymentQrCard({ card }: { card: ReadyCard }) {
  const t = await getTranslations('settings.billing.payment');
  const { invoice, receiver } = card;
  return (
    <div className="stack">
      <p>
        <strong>{t('invoiceLine', { number: invoice.number })}</strong>
        {invoice.reported ? (
          <>
            {' '}
            <span className="invoice-status invoice-status-warning">{t('reportedBadge')}</span>
          </>
        ) : null}
      </p>
      <div className="row">
        {/* biome-ignore lint/performance/noImgElement: ảnh data URL dựng tại chỗ, không có gì để tối ưu bằng next/image */}
        <img
          src={card.qrDataUrl}
          alt={t('qrAlt', { number: invoice.number })}
          width={256}
          height={256}
        />
        <dl className="stack-tight">
          <dt className="muted">{t('amount')}</dt>
          <dd>
            <strong>{formatVnd(invoice.amountVnd)}</strong>
          </dd>
          <dt className="muted">{t('bank')}</dt>
          <dd>{receiver.bankBin}</dd>
          <dt className="muted">{t('account')}</dt>
          <dd>{receiver.accountNumber}</dd>
          <dt className="muted">{t('accountName')}</dt>
          <dd>{receiver.accountName}</dd>
          <dt className="muted">{t('transferCode')}</dt>
          <dd>
            <strong>{invoice.transferCode}</strong>
          </dd>
        </dl>
      </div>
      <p className="muted">{t('transferHint')}</p>
      {invoice.reported ? (
        <p role="status">{t('reportedBody')}</p>
      ) : (
        <form action={reportTransferAction}>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <button type="submit" className="btn btn-primary">
            {t('report')}
          </button>
        </form>
      )}
    </div>
  );
}

import { CreditCard, FileText, Layers, QrCode, ReceiptText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { InvoiceListRow } from '../../lib/billing-view';
import {
  ADDON_TURNS,
  formatCount,
  formatVnd,
  PLAN_CATALOG,
  type PlanCode,
  planByCode,
  yearlyPriceVnd,
} from '../../lib/plan-catalog';
import type { UsageMeterView } from '../../lib/usage-meter-view';
import type { PaymentCard } from '../../server/invoice-payment';
import { SectionHead } from '../ui/section-head';
import { PaymentQrCard } from './payment-qr-card';
import { UsageMeterCard } from './usage-meter-card';

/**
 * Trang Gói & Thanh toán (design/stitch/settings-billing.png). Chỉ trình bày: gói hiện tại (null = chưa có dữ liệu gói),
 * đồng hồ lượt AI thật, bảng so sánh gói (số liệu docs/10 §3), hóa đơn thật. Mọi nút mua/nâng/đổi chu kỳ tắt kèm
 * "Sắp có" — chưa gọi dịch vụ thanh toán nào.
 */
export async function BillingView({
  currentPlan,
  usage,
  invoices,
  payment = null,
  paymentNotice = null,
}: {
  currentPlan: PlanCode | null;
  usage: UsageMeterView | null;
  invoices: InvoiceListRow[];
  /** Thẻ QR chuyển khoản (QR-PAYMENT); `null`/`disabled` = khối "Sắp có" như cũ. */
  payment?: PaymentCard | null;
  paymentNotice?: 'reported' | 'error' | null;
}) {
  const t = await getTranslations('settings');
  const current = currentPlan ? planByCode(currentPlan) : undefined;
  const soon = t('soon');
  return (
    <>
      <header className="stack-tight">
        <h1 className="page-title">{t('billing.title')}</h1>
        <p className="page-subtitle">{t('billing.subtitle')}</p>
      </header>

      <section className="card stack" aria-labelledby="billing-current">
        <SectionHead
          id="billing-current"
          icon={<CreditCard size={20} />}
          title={
            current
              ? t('billing.current.planLine', {
                  plan: t(`billing.compare.plan.${current.code}.name`),
                })
              : t('billing.current.title')
          }
          description={
            current ? undefined : (
              <>
                <strong>{t('billing.current.unknownTitle')}</strong> —{' '}
                {t('billing.current.unknownBody')}
              </>
            )
          }
          end={
            current ? <span className="badge badge-on">{t('billing.current.active')}</span> : null
          }
        />
        {current ? (
          <p className="billing-price">
            {t('billing.current.price', { price: formatVnd(current.priceVnd) })}
          </p>
        ) : null}
        <div className="row">
          <button type="button" className="btn btn-secondary" disabled>
            {t('billing.current.change')} · {soon}
          </button>
          <button type="button" className="btn btn-secondary" disabled>
            {t('billing.current.cancel')} · {soon}
          </button>
        </div>
      </section>

      {usage ? <UsageMeterCard view={usage} /> : null}

      <section className="card stack" aria-labelledby="billing-compare">
        <SectionHead
          id="billing-compare"
          icon={<Layers size={20} />}
          title={t('billing.compare.title')}
          description={t('billing.compare.body')}
        />
        <ul className="plan-grid">
          {PLAN_CATALOG.map((plan) => {
            const isCurrent = plan.code === currentPlan;
            return (
              <li key={plan.code} className="plan-card" data-current={isCurrent || undefined}>
                <p className="plan-tag">{t(`billing.compare.plan.${plan.code}.tag`)}</p>
                <h3 className="section-subtitle">{t(`billing.compare.plan.${plan.code}.name`)}</h3>
                <p className="billing-price">
                  {formatVnd(plan.priceVnd)}
                  <span className="muted">{t('billing.compare.perMonth')}</span>
                </p>
                <p className="muted">
                  {t('billing.compare.perYear', {
                    price: formatVnd(yearlyPriceVnd(plan.priceVnd)),
                  })}
                </p>
                <ul className="plan-features">
                  <li>{t('billing.compare.channels', { count: plan.channelsLimit })}</li>
                  <li>
                    {t('billing.compare.turns', {
                      count: formatCount(plan.monthlyTurns),
                    })}
                  </li>
                  <li>
                    {plan.autoReply
                      ? t('billing.compare.autoReplyYes')
                      : t('billing.compare.autoReplyNo')}
                  </li>
                </ul>
                {isCurrent ? (
                  <span className="badge badge-on">{t('billing.compare.currentBadge')}</span>
                ) : (
                  <button type="button" className="btn btn-secondary" disabled>
                    {t('billing.compare.choose')} · {soon}
                  </button>
                )}
              </li>
            );
          })}
          <li className="plan-card plan-card-addon">
            <p className="plan-tag">{t('billing.compare.addonTitle')}</p>
            <h3 className="section-subtitle">+{formatCount(ADDON_TURNS.turns)}</h3>
            <p className="billing-price">
              {t('billing.compare.addonPrice', { price: formatVnd(ADDON_TURNS.priceVnd) })}
            </p>
            <p className="muted">
              {t('billing.compare.addonBody', { turns: formatCount(ADDON_TURNS.turns) })}
            </p>
            <button type="button" className="btn btn-secondary" disabled>
              {t('billing.compare.addonButton')} · {soon}
            </button>
          </li>
        </ul>
      </section>

      <section className="card stack" aria-labelledby="billing-payment">
        <SectionHead
          id="billing-payment"
          icon={<QrCode size={20} />}
          title={t('billing.payment.title')}
          description={t('billing.payment.body')}
          end={
            payment?.state === 'ready' ? null : (
              <span className="badge badge-off">{t('billing.payment.soon')}</span>
            )
          }
        />
        {paymentNotice ? (
          <p role={paymentNotice === 'reported' ? 'status' : 'alert'}>
            {t(
              paymentNotice === 'reported'
                ? 'billing.payment.reportDone'
                : 'billing.payment.reportError',
            )}
          </p>
        ) : null}
        {payment?.state === 'ready' ? <PaymentQrCard card={payment} /> : null}
        {payment?.state === 'unavailable' ? (
          <p className="muted">{t('billing.payment.unavailable')}</p>
        ) : null}
        {payment?.state === 'none' ? <p className="muted">{t('billing.payment.none')}</p> : null}
      </section>

      <section className="card stack" aria-labelledby="billing-invoices">
        <SectionHead
          id="billing-invoices"
          icon={<ReceiptText size={20} />}
          title={t('billing.invoices.title')}
          description={t('billing.invoices.body')}
          end={
            <button type="button" className="btn btn-secondary" disabled>
              {t('billing.invoices.export')} · {soon}
            </button>
          }
        />
        {invoices.length === 0 ? (
          <p className="muted">{t('billing.invoices.empty')}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('billing.invoices.number')}</th>
                  <th scope="col">{t('billing.invoices.date')}</th>
                  <th scope="col">{t('billing.invoices.description')}</th>
                  <th scope="col">{t('billing.invoices.amount')}</th>
                  <th scope="col">{t('billing.invoices.status')}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.number}</th>
                    <td>{row.dateIso}</td>
                    <td>{row.description}</td>
                    <td>{formatVnd(row.amountVnd)}</td>
                    <td>
                      <span className={`invoice-status invoice-status-${row.tone}`}>
                        {t(`billing.invoices.status_${row.statusKey}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="billing-vat">
          <FileText size={18} aria-hidden="true" />
          <div>
            <strong>{t('billing.invoices.vatTitle')}</strong>
            <p className="muted">
              {t('billing.invoices.vatBody')} · {soon}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

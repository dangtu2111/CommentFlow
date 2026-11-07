import { getTranslations } from 'next-intl/server';
import type { InvoiceListRow } from '../../lib/billing-view';
import { cn } from '../../lib/cn';
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
import { Icon } from '../ui/icon';
import { PaymentQrCard } from './payment-qr-card';
import { SettingsFrame, type SettingsFrameScope } from './settings-frame';
import { TwCard, TwChip, TwSoonButton } from './tw/ui';

const CURRENT_ID = 'billing-current';
const COMPARE_ID = 'billing-compare';
const PAYMENT_ID = 'billing-payment';
const INVOICES_ID = 'billing-invoices';
const BAR_TONE = {
  ok: 'bg-primary-container',
  warning: 'bg-tertiary-container',
  blocked: 'bg-error',
};
const INVOICE_TONE: Record<string, string> = {
  success: 'bg-[#EBF7ED] text-[#237A36]',
  warning: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  danger: 'bg-error-container text-on-error-container',
  muted: 'bg-surface-container text-on-surface-variant',
};

/** Một ô số liệu của lưới "bento" (lượt AI / kênh / nhân sự). */
function BentoCard({
  label,
  chip,
  value,
  unit,
  children,
  footer,
}: {
  label: string;
  chip?: string;
  value: string;
  unit: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between space-y-space-md">
      <div className="space-y-space-xs">
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            {label}
          </span>
          {chip ? <TwChip tone="neutral">{chip}</TwChip> : null}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-headline-lg text-headline-lg font-bold text-on-surface">
            {value}
          </span>
          <span className="font-title-sm text-title-sm text-on-surface-variant">{unit}</span>
        </div>
      </div>
      {children}
      {footer}
    </div>
  );
}

/**
 * Trang Gói & Thanh toán (design/stitch/settings-billing.html). Chỉ trình bày: gói hiện tại (null = chưa có dữ liệu gói),
 * đồng hồ lượt AI thật, bảng so sánh gói (số liệu docs/10 §3), hóa đơn thật. Mọi nút mua/nâng/đổi chu kỳ tắt kèm
 * "Sắp có" — chưa gọi dịch vụ thanh toán nào.
 */
export async function BillingView({
  currentPlan,
  usage,
  invoices,
  payment = null,
  paymentNotice = null,
  frame,
}: {
  frame: SettingsFrameScope;
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
  const counts = frame.counts;
  return (
    <SettingsFrame {...frame} active="billing" variant="tabs">
      <TwCard labelledBy={CURRENT_ID} className="relative overflow-hidden p-space-lg lg:p-space-xl">
        <div
          aria-hidden="true"
          className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-secondary-fixed/30 blur-3xl pointer-events-none"
        />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id={CURRENT_ID}
                className="font-headline-sm text-headline-sm text-on-surface font-bold"
              >
                {current
                  ? t('billing.current.planLine', {
                      plan: t(`billing.compare.plan.${current.code}.name`),
                    })
                  : t('billing.current.title')}
              </h2>
              {current ? (
                <>
                  <TwChip tone="primary" dot className="px-2.5 font-semibold">
                    {t('billing.current.active')}
                  </TwChip>
                  <TwChip tone="info" className="font-semibold">
                    {t('billing.current.price', { price: formatVnd(current.priceVnd) })}
                  </TwChip>
                </>
              ) : null}
            </div>
            {current ? null : (
              <p className="font-body-md text-body-md text-on-surface-variant">
                <strong>{t('billing.current.unknownTitle')}</strong> —{' '}
                {t('billing.current.unknownBody')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-space-sm shrink-0 flex-wrap">
            <TwSoonButton tone="soft" soon={soon}>
              <Icon name="manage_accounts" size={16} />
              {t('billing.current.change')}
            </TwSoonButton>
            <TwSoonButton tone="danger-soft" soon={soon}>
              {t('billing.current.cancel')}
            </TwSoonButton>
          </div>
        </div>
        {usage && usage.level !== 'ok' ? (
          <div className="relative bg-surface-container rounded-xl p-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="w-10 h-10 rounded-xl bg-tertiary-container text-on-tertiary-container flex items-center justify-center shrink-0"
              >
                <Icon name="warning" size={20} />
              </span>
              <div className="space-y-1">
                <p className="font-title-sm text-title-sm text-on-surface font-bold">
                  {t(`usage.${usage.level}.title`)}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant max-w-3xl">
                  {t(`usage.${usage.level}.body`, { percent: Math.round(usage.percent) })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <TwSoonButton tone="primary" soon={soon}>
                <Icon name="add_circle" size={16} />
                {t('billing.compare.addonButton')}
              </TwSoonButton>
              <TwSoonButton tone="secondary" soon={soon}>
                <Icon name="send" size={16} />
                {t('billing.compare.choose')}
              </TwSoonButton>
            </div>
          </div>
        ) : null}
      </TwCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
        {usage ? (
          <BentoCard
            label={t('billing.bento.turns')}
            chip={`${Math.round(usage.percent)}%`}
            value={formatCount(usage.used)}
            unit={t('billing.bento.turnsOf', { capacity: formatCount(usage.capacity) })}
            footer={
              <p className="bg-surface-container-low p-2.5 rounded-lg flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
                <Icon name="info" size={14} />
                {t('usage.summary', {
                  used: formatCount(usage.used),
                  capacity: formatCount(usage.capacity),
                  remaining: formatCount(usage.remaining),
                })}
              </p>
            }
          >
            <div
              className="w-full bg-surface-container-high rounded-full h-2.5 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(usage.percent)}
              aria-label={t('billing.bento.turns')}
            >
              <div
                className={cn('h-full rounded-full', BAR_TONE[usage.level])}
                style={{ width: `${usage.percent}%` }}
              />
            </div>
          </BentoCard>
        ) : null}
        {counts ? (
          <>
            <BentoCard
              label={t('billing.bento.channels')}
              value={String(counts.channelsConnected)}
              unit={t('billing.bento.channelsOf', { total: counts.channelsTotal })}
            />
            <BentoCard
              label={t('billing.bento.members')}
              value={String(counts.members)}
              unit={t('billing.bento.membersUnit')}
            />
          </>
        ) : null}
      </div>

      <section aria-labelledby={COMPARE_ID} className="space-y-space-md">
        <div>
          <h2
            id={COMPARE_ID}
            className="font-headline-sm text-headline-sm text-on-surface font-bold"
          >
            {t('billing.compare.title')}
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {t('billing.compare.body')}
          </p>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-space-lg">
          {PLAN_CATALOG.map((plan) => {
            const isCurrent = plan.code === currentPlan;
            return (
              <li
                key={plan.code}
                className={cn(
                  'relative bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between space-y-space-lg',
                  isCurrent && 'ring-2 ring-primary-container',
                )}
              >
                {isCurrent ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary-container text-on-primary font-label-sm text-label-sm font-bold shadow-sm">
                    {t('billing.compare.currentBadge')}
                  </span>
                ) : null}
                <div className="space-y-space-md">
                  <div className="space-y-1">
                    <span className="px-2 py-0.5 rounded bg-surface-container font-label-sm text-label-sm text-on-surface-variant font-semibold">
                      {t(`billing.compare.plan.${plan.code}.tag`)}
                    </span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      {t(`billing.compare.plan.${plan.code}.name`)}
                    </h3>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-headline-lg text-headline-lg font-bold text-on-surface">
                        {formatVnd(plan.priceVnd)}
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        {t('billing.compare.perMonth')}
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {t('billing.compare.perYear', {
                        price: formatVnd(yearlyPriceVnd(plan.priceVnd)),
                      })}
                    </p>
                  </div>
                  <ul className="space-y-2.5 font-body-sm text-body-sm text-on-surface">
                    <li className="flex items-center gap-2">
                      <span className="text-primary">
                        <Icon name="check_circle" size={16} />
                      </span>
                      {t('billing.compare.channels', { count: plan.channelsLimit })}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">
                        <Icon name="check_circle" size={16} />
                      </span>
                      {t('billing.compare.turns', { count: formatCount(plan.monthlyTurns) })}
                    </li>
                    <li
                      className={cn(
                        'flex items-center gap-2',
                        plan.autoReply ? 'font-medium text-primary' : 'text-outline',
                      )}
                    >
                      <Icon name={plan.autoReply ? 'check_circle' : 'cancel'} size={16} />
                      {plan.autoReply
                        ? t('billing.compare.autoReplyYes')
                        : t('billing.compare.autoReplyNo')}
                    </li>
                  </ul>
                </div>
                {isCurrent ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-2.5 rounded-lg bg-surface-container text-on-surface-variant font-title-sm text-title-sm font-semibold cursor-default"
                  >
                    {t('billing.compare.currentBadge')}
                  </button>
                ) : (
                  <TwSoonButton tone="soft" soon={soon}>
                    {t('billing.compare.choose')}
                  </TwSoonButton>
                )}
              </li>
            );
          })}
          <li className="bg-surface-container-low rounded-xl p-space-lg shadow-sm flex flex-col justify-between space-y-space-lg">
            <div className="space-y-space-md">
              <div className="space-y-1">
                <span className="px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm font-bold">
                  {t('billing.compare.addonTitle')}
                </span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  +{formatCount(ADDON_TURNS.turns)}
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {t('billing.compare.addonBody', { turns: formatCount(ADDON_TURNS.turns) })}
                </p>
              </div>
              <p className="font-headline-lg text-headline-lg font-bold text-tertiary">
                {t('billing.compare.addonPrice', { price: formatVnd(ADDON_TURNS.priceVnd) })}
              </p>
            </div>
            <TwSoonButton tone="soft" soon={soon}>
              <Icon name="add_circle" size={16} />
              {t('billing.compare.addonButton')}
            </TwSoonButton>
          </li>
        </ul>
      </section>

      <TwCard labelledBy={PAYMENT_ID} className="p-space-lg lg:p-space-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
          <div className="space-y-1">
            <h2
              id={PAYMENT_ID}
              className="font-headline-sm text-headline-sm text-on-surface font-bold"
            >
              {t('billing.payment.title')}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('billing.payment.body')}
            </p>
          </div>
          {payment?.state === 'ready' ? null : (
            <TwChip tone="muted" className="px-3 py-1.5">
              {t('billing.payment.soon')}
            </TwChip>
          )}
        </div>
        {paymentNotice ? (
          <p
            role={paymentNotice === 'reported' ? 'status' : 'alert'}
            className="font-body-md text-body-md"
          >
            {t(
              paymentNotice === 'reported'
                ? 'billing.payment.reportDone'
                : 'billing.payment.reportError',
            )}
          </p>
        ) : null}
        {payment?.state === 'ready' ? <PaymentQrCard card={payment} /> : null}
        {payment?.state === 'unavailable' ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('billing.payment.unavailable')}
          </p>
        ) : null}
        {payment?.state === 'none' ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('billing.payment.none')}
          </p>
        ) : null}
      </TwCard>

      <TwCard labelledBy={INVOICES_ID} className="p-space-lg lg:p-space-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
          <div>
            <h2
              id={INVOICES_ID}
              className="font-headline-sm text-headline-sm text-on-surface font-bold"
            >
              {t('billing.invoices.title')}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('billing.invoices.body')}
            </p>
          </div>
          <TwSoonButton tone="soft" soon={soon}>
            <Icon name="download" size={16} />
            {t('billing.invoices.export')}
          </TwSoonButton>
        </div>
        {invoices.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('billing.invoices.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant uppercase">
                <tr>
                  <th scope="col" className="py-2.5 px-3">
                    {t('billing.invoices.number')}
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    {t('billing.invoices.date')}
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    {t('billing.invoices.description')}
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    {t('billing.invoices.amount')}
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    {t('billing.invoices.status')}
                  </th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {invoices.map((row, index) => (
                  <tr
                    key={row.id}
                    className={index % 2 === 1 ? 'bg-surface-container-low/30' : undefined}
                  >
                    <th scope="row" className="py-3 px-3 font-title-sm text-title-sm">
                      {row.number}
                    </th>
                    <td className="py-3 px-3">{row.dateIso}</td>
                    <td className="py-3 px-3">{row.description}</td>
                    <td className="py-3 px-3">{formatVnd(row.amountVnd)}</td>
                    <td className="py-3 px-3">
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold',
                          INVOICE_TONE[row.tone] ?? INVOICE_TONE.muted,
                        )}
                      >
                        {t(`billing.invoices.status_${row.statusKey}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-start gap-3 p-space-md rounded-xl bg-surface-container-low">
          <span className="text-primary">
            <Icon name="policy" size={18} />
          </span>
          <div>
            <p className="font-title-sm text-title-sm text-on-surface">
              {t('billing.invoices.vatTitle')}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('billing.invoices.vatBody')} · {soon}
            </p>
          </div>
        </div>
      </TwCard>
    </SettingsFrame>
  );
}

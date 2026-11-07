import type { KbOverview, ShopifyStoreRow } from '@flow/db/runtime';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import {
  connectShopifyAction,
  disconnectShopifyAction,
  type ShopifyNotice,
  syncShopifyAction,
} from '../../app/app/(guarded)/kb/shopify-actions';
import { cn } from '../../lib/cn';
import { shopifyReasonKey } from '../../lib/shopify-reason';
import { TwDialog, TwDialogTrigger, TwSubmit } from '../settings/tw/dialog';
import { twBtn } from '../settings/tw/ui';
import { Icon, type IconName } from '../ui/icon';

const NOTICES: readonly ShopifyNotice[] = [
  'connected',
  'invalid',
  'not_configured',
  'forbidden',
  'unavailable',
  'sync_queued',
  'sync_recent',
  'disconnected',
  'not_found',
  'rate_limited',
];
const GOOD: readonly ShopifyNotice[] = ['connected', 'sync_queued', 'disconnected'];

/** Mã thông báo `?sh=` hợp lệ hoặc `null`. */
export function shopifyNoticeOf(value: string | string[] | undefined): ShopifyNotice | null {
  const v = Array.isArray(value) ? value[0] : value;
  return NOTICES.find((code) => code === v) ?? null;
}

const CARD = 'rounded-xl bg-surface-container-lowest p-space-lg shadow-sm';
const SOFT_BTN =
  'inline-flex items-center gap-1.5 rounded-lg bg-surface-container px-3 py-2 font-title-sm text-title-sm text-on-surface shadow-sm transition-colors hover:bg-surface-container-high';
const SOON_BTN = `${SOFT_BTN} cursor-not-allowed opacity-60`;
const INPUT =
  'w-full rounded-lg bg-surface-container px-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60';

const TILES = [
  { key: 'products', icon: 'inventory_2', href: '/app/products/import' },
  { key: 'policies', icon: 'policy', href: '/app/kb/policies' },
  { key: 'faqs', icon: 'quiz', href: '/app/kb/faq' },
] as const satisfies ReadonlyArray<{ key: string; icon: IconName; href: string }>;

const CONNECT_ID = 'shopify-connect-dialog';
const DISCONNECT_ID = 'shopify-disconnect-dialog';

/**
 * Khối "Kết nối Shopify Store" của trang Nguồn dữ liệu (design/stitch/knowledge-base.png). Ba trạng thái: chưa kết nối
 * (nút Kết nối mở hộp nhập tên miền + token Admin API), đang kết nối (Đồng bộ ngay, Ngắt kết nối, kết quả lần cuối),
 * token hỏng (nhắc nhập lại). Token chỉ đi form → máy chủ → DB mã hóa; không bao giờ hiện lại. "Cài đặt phạm vi" vẫn
 * "Sắp có" (chưa có tính năng chọn phạm vi).
 */
export async function ShopifyCard({
  store,
  counts,
  notice,
}: {
  store: ShopifyStoreRow | null;
  counts: KbOverview['counts'];
  notice: ShopifyNotice | null;
}) {
  const [t, format] = await Promise.all([getTranslations('kb'), getFormatter()]);
  const connected = store?.status === 'connected';
  const invalid = store?.status === 'invalid';
  const active = connected || invalid;
  const statusTone = connected
    ? 'bg-[#EBF7ED] text-[#237A36]'
    : invalid
      ? 'bg-error-container text-on-error-container'
      : 'bg-surface-container-high text-on-surface-variant';
  const statusLabel = connected
    ? t('hub.shopify.status.connected')
    : invalid
      ? t('hub.shopify.status.invalid')
      : t('hub.notConnected');
  const summary = store?.lastSyncSummary ?? {};
  const resultKey = store?.lastSyncResult ?? null;
  const reasonKey = resultKey === 'ok' ? null : shopifyReasonKey(summary.reason, summary.scope);

  return (
    <section className={CARD} aria-labelledby="hub-shopify">
      {notice ? (
        <p
          role={GOOD.includes(notice) ? 'status' : 'alert'}
          className={cn(
            'mb-space-md rounded-lg px-3 py-2 font-body-md text-body-md',
            GOOD.includes(notice)
              ? 'bg-[#EBF7ED] text-[#237A36]'
              : 'bg-error-container text-on-error-container',
          )}
        >
          {t(`hub.shopify.notice.${notice}`)}
        </p>
      ) : null}
      <div className="flex flex-col gap-space-md lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-space-md">
          <span className="grid size-12 place-items-center rounded-xl bg-surface-container text-primary">
            <Icon name="shopping_cart" size={24} />
          </span>
          <div>
            <h2
              id="hub-shopify"
              className="flex flex-wrap items-center gap-2 font-title-md text-title-md text-on-surface"
            >
              {t('hub.shopify.title')}
              <span
                className={cn('rounded-full px-2 py-0.5 font-label-sm text-label-sm', statusTone)}
              >
                {statusLabel}
              </span>
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {active && store
                ? t('hub.shopify.connectedLine', { domain: store.shopDomain })
                : t('hub.shopify.body')}
            </p>
            {store?.lastSyncedAt ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t('hub.shopify.lastSynced', {
                  time: format.dateTime(store.lastSyncedAt, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }),
                })}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connected ? (
            <form action={syncShopifyAction}>
              <TwSubmit tone="primary">
                <Icon name="sync" size={16} />
                {t('hub.shopify.sync')}
              </TwSubmit>
            </form>
          ) : (
            <TwDialogTrigger dialogId={CONNECT_ID} className={twBtn({ tone: 'primary' })}>
              <Icon name="add_link" size={16} />
              {invalid ? t('hub.shopify.reconnect') : t('hub.shopify.connect')}
            </TwDialogTrigger>
          )}
          <span className={SOON_BTN} aria-disabled="true" title={t('soon')}>
            <Icon name="tune" size={16} />
            {t('hub.shopify.scope')}
            <span className="text-on-surface-variant">· {t('soon')}</span>
          </span>
          {active ? (
            <TwDialogTrigger dialogId={DISCONNECT_ID} className={twBtn({ tone: 'plain' })}>
              <Icon name="link_off" size={16} />
              <span className="sr-only">{t('hub.shopify.disconnect')}</span>
            </TwDialogTrigger>
          ) : null}
        </div>
      </div>

      {resultKey ? (
        <p
          className={cn(
            'mt-space-md font-body-sm text-body-sm',
            resultKey === 'ok' ? 'text-[#237A36]' : 'text-error',
          )}
        >
          {t(`hub.shopify.result.${resultKey}`, {
            products: (summary.productsCreated ?? 0) + (summary.productsUpdated ?? 0),
            variants: (summary.variantsCreated ?? 0) + (summary.variantsUpdated ?? 0),
          })}
        </p>
      ) : null}

      {reasonKey ? (
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
          {t(`hub.shopify.reason.${reasonKey}`)}
        </p>
      ) : null}

      <ul className="mt-space-md grid gap-space-md sm:grid-cols-3">
        {TILES.map((tile) => (
          <li key={tile.key}>
            <Link
              href={tile.href}
              className="flex items-center gap-space-md rounded-xl bg-surface-container-low p-space-md transition-colors hover:bg-surface-container"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-surface-container-lowest text-primary">
                <Icon name={tile.icon} size={20} />
              </span>
              <span>
                <span className="block font-headline-sm text-headline-sm text-on-surface">
                  {format.number(counts[tile.key])}
                </span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant">
                  {t(`hub.tiles.${tile.key}`)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <TwDialog
        dialogId={CONNECT_ID}
        title={t('hub.shopify.dialog.title')}
        description={t('hub.shopify.dialog.body')}
        icon={<Icon name="shopping_cart" size={20} />}
        size="lg"
      >
        <form action={connectShopifyAction} className="space-y-space-md">
          <label className="block space-y-1">
            <span className="block font-title-sm text-title-sm text-on-surface">
              {t('hub.shopify.dialog.domain')}
            </span>
            <input
              name="domain"
              required
              maxLength={200}
              autoComplete="off"
              placeholder={t('hub.shopify.dialog.domainPlaceholder')}
              defaultValue={store?.shopDomain ?? ''}
              className={INPUT}
            />
          </label>
          <label className="block space-y-1">
            <span className="block font-title-sm text-title-sm text-on-surface">
              {t('hub.shopify.dialog.clientId')}
            </span>
            <input
              name="clientId"
              required
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
              className={INPUT}
            />
          </label>
          <div className="space-y-1">
            <label
              htmlFor="shopify-client-secret"
              className="block font-title-sm text-title-sm text-on-surface"
            >
              {t('hub.shopify.dialog.clientSecret')}
            </label>
            <input
              id="shopify-client-secret"
              name="clientSecret"
              type="password"
              required
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="shopify-client-secret-hint"
              className={INPUT}
            />
            <span
              id="shopify-client-secret-hint"
              className="block font-body-sm text-body-sm text-on-surface-variant"
            >
              {t('hub.shopify.dialog.clientSecretHint')}
            </span>
          </div>
          <ol className="list-decimal space-y-1 rounded-lg bg-surface-container-low p-space-md pl-space-xl font-body-sm text-body-sm text-on-surface-variant">
            <li>{t('hub.shopify.dialog.step1')}</li>
            <li>{t('hub.shopify.dialog.step2')}</li>
            <li>{t('hub.shopify.dialog.step3')}</li>
          </ol>
          <div className="flex justify-end">
            <TwSubmit tone="primary">{t('hub.shopify.dialog.submit')}</TwSubmit>
          </div>
        </form>
      </TwDialog>

      {active ? (
        <TwDialog
          dialogId={DISCONNECT_ID}
          title={t('hub.shopify.disconnectDialog.title')}
          icon={<Icon name="link_off" size={24} />}
          tone="danger"
        >
          <form action={disconnectShopifyAction} className="space-y-space-md">
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t('hub.shopify.disconnectDialog.body')}
            </p>
            <div className="flex justify-end">
              <TwSubmit tone="danger">{t('hub.shopify.disconnectDialog.confirm')}</TwSubmit>
            </div>
          </form>
        </TwDialog>
      ) : null}
    </section>
  );
}

import { getShopifyStore, loadKbOverview } from '@flow/db/runtime';
import Link from 'next/link';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { ShopifyCard, shopifyNoticeOf } from '../../../../components/kb/shopify-card';
import { Icon, type IconName } from '../../../../components/ui/icon';
import { cn } from '../../../../lib/cn';
import { TRY_AI_MAX_CHARS } from '../../../../lib/try-ai-limits';
import { getBrand } from '../../../../server/brand';
import { getDb } from '../../../../server/db';
import { loadReadiness, readinessLangOf } from '../../../../server/readiness';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('kb');
  return { title: `${t('pageTitle')} · ${getBrand().name}` };
}

const CARD = 'rounded-xl bg-surface-container-lowest p-space-lg shadow-sm';
const SOFT_BTN =
  'inline-flex items-center gap-1.5 rounded-lg bg-surface-container px-3 py-2 font-title-sm text-title-sm text-on-surface shadow-sm transition-colors hover:bg-surface-container-high';
const SOON_BTN = `${SOFT_BTN} cursor-not-allowed opacity-60`;

const SHORT_DATE_TIME = { dateStyle: 'short', timeStyle: 'short' } as const;

/**
 * Cơ sở kiến thức — trang "Nguồn dữ liệu" (design/stitch/knowledge-base.png, QUKP1): chỉ Owner. Số liệu THẬT từ
 * `loadReadiness` và `loadKbOverview` (đếm theo bảng, nguồn `kb_sources`, một sản phẩm mẫu). Khối thiết kế chưa có chức
 * năng (kết nối Shopify, thêm/đồng bộ URL, ghi chú riêng cho AI) vẫn hiện, nút vô hiệu + "Sắp có" — không số liệu bịa.
 */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function KbHubPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, locale, format, query] = await Promise.all([
    getTranslations('kb'),
    getLocale(),
    getFormatter(),
    searchParams,
  ]);

  let readiness: Awaited<ReturnType<typeof loadReadiness>> | null = null;
  let overview: Awaited<ReturnType<typeof loadKbOverview>> | null = null;
  let shopify: Awaited<ReturnType<typeof getShopifyStore>> = null;
  try {
    [readiness, [overview, shopify]] = await Promise.all([
      loadReadiness(workspace.id, user.id, readinessLangOf(locale)),
      getDb().withActor(
        workspace.id,
        user.id,
        async (tx) =>
          [
            await loadKbOverview(tx, workspace.id),
            await getShopifyStore(tx, workspace.id),
          ] as const,
      ),
    ]);
  } catch {
    readiness = null;
    overview = null;
  }
  if (!readiness || !overview) {
    return (
      <main className="app-page" role="alert">
        <h1 className="auth-title">{t('error.title')}</h1>
        <p className="muted">{t('error.body')}</p>
      </main>
    );
  }
  const product = overview.sampleProduct;

  return (
    <main className="app-page app-page-wide">
      <KbFrame
        active="kb"
        completeness={{
          score: readiness.score,
          ready: readiness.ready,
          minPercent: readiness.minPercent,
        }}
      >
        <div className="tw space-y-space-lg">
          <ShopifyCard
            store={shopify}
            counts={overview.counts}
            notice={shopifyNoticeOf(query.sh)}
          />

          <section className={CARD} aria-labelledby="hub-sources">
            <div className="flex flex-wrap items-center justify-between gap-space-md">
              <div className="flex items-center gap-space-sm">
                <span className="text-primary">
                  <Icon name="language" size={20} />
                </span>
                <div>
                  <h2 id="hub-sources" className="font-title-md text-title-md text-on-surface">
                    {t('hub.sources.title')}
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {t('hub.sources.body')}
                  </p>
                </div>
              </div>
              <span className={SOON_BTN} aria-disabled="true" title={t('soon')}>
                <Icon name="add_link" size={16} />
                {t('hub.sources.add')}
                <span className="text-on-surface-variant">· {t('soon')}</span>
              </span>
            </div>
            {overview.sources.length === 0 ? (
              <p className="mt-space-md font-body-md text-body-md text-on-surface-variant">
                {t('hub.sources.empty')}
              </p>
            ) : (
              <div className="mt-space-md overflow-x-auto rounded-lg">
                <table className="w-full text-left">
                  <thead className="bg-surface-container-low">
                    <tr className="font-label-md text-label-md uppercase tracking-wide text-on-surface-variant">
                      <th className="px-3 py-2">{t('hub.sources.colUrl')}</th>
                      <th className="px-3 py-2">{t('hub.sources.colType')}</th>
                      <th className="px-3 py-2">{t('hub.sources.colStatus')}</th>
                      <th className="px-3 py-2">{t('hub.sources.colUpdated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.sources.map((source) => (
                      <tr
                        key={source.id}
                        className={cn(
                          'border-t border-surface-container',
                          source.syncError ? 'bg-error-container/30' : '',
                        )}
                      >
                        <td className="px-3 py-3 font-body-md text-body-md text-primary">
                          {source.originUrl ?? source.title}
                          <span className="block font-body-sm text-body-sm text-on-surface-variant">
                            {source.title}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-body-sm text-body-sm text-on-surface">
                          {source.type}
                        </td>
                        <td className="px-3 py-3 font-body-sm text-body-sm">
                          {source.syncError ? (
                            <span className="text-error">{t('hub.sources.syncError')}</span>
                          ) : (
                            <span className="text-on-surface">{source.status}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-body-sm text-body-sm text-on-surface-variant">
                          {source.lastSyncedAt
                            ? format.dateTime(source.lastSyncedAt, SHORT_DATE_TIME)
                            : t('hub.sources.neverSynced')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={CARD} aria-labelledby="hub-product">
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-sm">
                <span className="text-primary">
                  <Icon name="inventory_2" size={20} />
                </span>
                <div>
                  <h2 id="hub-product" className="font-title-md text-title-md text-on-surface">
                    {t('hub.product.title')}
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {t('hub.product.body')}
                  </p>
                </div>
              </div>
              <span className="font-label-md text-label-md text-on-surface-variant">
                {t('hub.product.showing', { total: overview.counts.products })}
              </span>
            </div>
            {product ? (
              <div className="mt-space-md rounded-xl bg-surface-container-low p-space-md space-y-space-sm">
                <h3 className="font-title-md text-title-md text-on-surface">{product.name}</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {[product.sku ? `SKU: ${product.sku}` : null, product.category]
                    .filter(Boolean)
                    .join(' • ')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {product.priceVnd !== null ? (
                    <span className="rounded-lg bg-surface-container-lowest px-3 py-1.5 font-title-md text-title-md text-primary">
                      {t('hub.product.price', { amount: format.number(product.priceVnd) })}
                    </span>
                  ) : null}
                  {product.stock !== null ? (
                    <span className="rounded-lg bg-surface-container-lowest px-3 py-1.5 font-title-sm text-title-sm text-on-surface">
                      {t('hub.product.stock', { count: product.stock })}
                    </span>
                  ) : null}
                  {product.variantCount > 0 ? (
                    <span className="rounded-lg bg-surface-container-lowest px-3 py-1.5 font-title-sm text-title-sm text-on-surface">
                      {t('hub.product.variants', { count: product.variantCount })}
                    </span>
                  ) : null}
                </div>
                <div className="rounded-lg bg-surface-container-lowest p-space-md">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-title-sm text-title-sm text-secondary">
                      {t('hub.product.hint')}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {t('soon')}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-space-md font-body-md text-body-md text-on-surface-variant">
                {t('hub.product.empty')}{' '}
                <Link href="/app/products/import" className="text-primary font-title-sm">
                  {t('hub.product.import')}
                </Link>
              </p>
            )}
          </section>

          <section className={CARD} aria-labelledby="hub-playground">
            <div className="flex items-center gap-space-sm">
              <span className="grid size-10 place-items-center rounded-lg bg-secondary-container text-on-secondary-container">
                <Icon name="science" size={20} />
              </span>
              <div>
                <h2 id="hub-playground" className="font-title-md text-title-md text-on-surface">
                  {t('hub.playground.title')}
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {t('hub.playground.body')}
                </p>
              </div>
            </div>
            <form
              action="/app/try-ai"
              method="get"
              className="mt-space-md flex flex-col gap-space-sm sm:flex-row sm:items-center"
            >
              <label htmlFor="hub-try-question" className="sr-only">
                {t('hub.playground.label')}
              </label>
              <input
                id="hub-try-question"
                name="q"
                required
                maxLength={TRY_AI_MAX_CHARS}
                autoComplete="off"
                placeholder={t('hub.playground.placeholder')}
                className="flex-1 rounded-lg bg-surface-container-low px-3 py-2.5 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary px-4 py-2.5 font-title-sm text-title-sm text-on-secondary shadow-sm"
              >
                <Icon name="play_arrow" size={16} />
                {t('hub.playground.run')}
              </button>
            </form>
          </section>
        </div>
      </KbFrame>
    </main>
  );
}

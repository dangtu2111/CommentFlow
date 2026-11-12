import { CATALOG_PAGE_SIZE, listCatalogProducts } from '@flow/db/runtime';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { KbPageHead } from '../../../../../components/kb/kb-content-ui';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { Icon } from '../../../../../components/ui/icon';
import {
  CATALOG_SOURCES,
  type CatalogParams,
  catalogHref,
  catalogSourceKey,
  formatCatalogPrice,
  pageRange,
  parseCatalogParams,
  stockState,
} from '../../../../../lib/catalog-view';
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('kbContent');
  return { title: `${t('catalog.title')} · ${getBrand().name}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SOURCE_TAB_KEY = {
  shopify: 'tabShopify',
  excel: 'tabExcel',
  manual: 'tabManual',
} as const;
const SOURCE_LABEL_KEY = { ...SOURCE_TAB_KEY, other: 'sourceOther' } as const;

const TAB =
  'px-3 py-1.5 rounded-lg font-title-sm text-title-sm whitespace-nowrap transition-colors';
const TAB_ON = `${TAB} bg-primary text-on-primary`;
const TAB_OFF = `${TAB} bg-surface-container-lowest text-on-surface hover:bg-surface-container-low`;
const OFF_CONTROL =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface font-title-sm text-title-sm shadow-sm cursor-not-allowed opacity-60';

/**
 * Danh mục sản phẩm của Cơ sở kiến thức (KB-CATALOG): chỉ Owner; dựng theo `design/stitch/kb-catalog.html` bằng dữ liệu THẬT, chỉ đọc — tìm theo tên/SKU, lọc nguồn, đang bán/ngừng bán, phân trang.
 * Chưa có nền tảng nên KHÔNG dựng (nút/ô tắt "Sắp có", không số mẫu): ghi chú riêng cho AI, giá Flash Sale, quy tắc điều hướng, lọc tồn kho/AI, thêm/xuất sản phẩm, gắn bài viết, bản nháp/xuất bản theo sản phẩm.
 * Ảnh sản phẩm không hiện (ảnh nằm trên CDN của nguồn; chưa cấu hình cho phép tải ảnh ngoài).
 */
export default async function KbCatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, raw] = await Promise.all([getTranslations('kbContent.catalog'), searchParams]);
  const params = parseCatalogParams(raw);
  const list = await getDb().withActor(workspace.id, user.id, (tx) =>
    listCatalogProducts(tx, workspace.id, {
      ...(params.source ? { source: params.source } : {}),
      ...(params.q ? { query: params.q } : {}),
      status: params.status,
      page: params.page,
    }),
  );
  const allCount = Object.values(list.bySource).reduce((sum, n) => sum + n, 0);
  const range = pageRange(params.page, CATALOG_PAGE_SIZE, list.total);
  const tabHref = (source: CatalogParams['source']) => catalogHref({ ...params, source, page: 1 });
  const statusHref = (status: CatalogParams['status']) =>
    catalogHref({ ...params, status, page: 1 });

  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbCatalog">
        <div className="tw space-y-space-lg">
          <KbPageHead title={t('title')} subtitle={t('subtitle')} />
          <p className="font-body-md text-body-md text-on-surface">
            {t(params.status === 'active' ? 'summary' : 'summaryArchived', { count: allCount })}
          </p>

          <div className="flex flex-wrap items-center gap-space-sm">
            <Link
              href="/app/products/import"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface font-title-sm text-title-sm shadow-sm"
            >
              <Icon name="upload" size={16} />
              {t('importFile')}
            </Link>
            <span aria-disabled="true" title={t('soon')} className={OFF_CONTROL}>
              <Icon name="download" size={16} />
              {t('exportCatalog')}
            </span>
            <span aria-disabled="true" title={t('soon')} className={OFF_CONTROL}>
              {t('addProduct')}
            </span>
          </div>

          <div className="rounded-xl bg-surface-container-lowest p-space-md shadow-sm space-y-space-md">
            <form method="get" action="/app/kb/catalog" className="relative w-full lg:max-w-md">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                <Icon name="search" size={18} />
              </span>
              {params.source ? <input type="hidden" name="source" value={params.source} /> : null}
              {params.status === 'archived' ? (
                <input type="hidden" name="status" value="archived" />
              ) : null}
              <input
                type="search"
                name="q"
                defaultValue={params.q}
                placeholder={t('search')}
                aria-label={t('search')}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container-low text-on-surface placeholder:text-on-surface-variant font-body-md text-body-md outline-none focus:shadow-md"
              />
              <button type="submit" className="sr-only">
                {t('searchSubmit')}
              </button>
            </form>

            <nav aria-label={t('colSource')} className="flex flex-wrap items-center gap-2">
              <Link
                href={tabHref(undefined)}
                aria-current={params.source ? undefined : 'page'}
                className={params.source ? TAB_OFF : TAB_ON}
              >
                {t('tabAll')} ({allCount})
              </Link>
              {CATALOG_SOURCES.map((source) => (
                <Link
                  key={source}
                  href={tabHref(source)}
                  aria-current={params.source === source ? 'page' : undefined}
                  className={params.source === source ? TAB_ON : TAB_OFF}
                >
                  {t(SOURCE_TAB_KEY[source])} ({list.bySource[source] ?? 0})
                </Link>
              ))}
              <span className="mx-1 h-5 w-px bg-outline-variant" aria-hidden="true" />
              <Link
                href={statusHref('active')}
                aria-current={params.status === 'active' ? 'page' : undefined}
                className={params.status === 'active' ? TAB_ON : TAB_OFF}
              >
                {t('statusActive')}
              </Link>
              <Link
                href={statusHref('archived')}
                aria-current={params.status === 'archived' ? 'page' : undefined}
                className={params.status === 'archived' ? TAB_ON : TAB_OFF}
              >
                {t('statusArchived')}
              </Link>
              <span aria-disabled="true" title={t('soon')} className={OFF_CONTROL}>
                {t('filterStock')}
              </span>
              <span aria-disabled="true" title={t('soon')} className={OFF_CONTROL}>
                {t('filterAi')}
              </span>
            </nav>
          </div>

          <section
            aria-label={t('title')}
            className="rounded-xl bg-surface-container-lowest shadow-sm overflow-x-auto"
          >
            {list.rows.length === 0 ? (
              <p className="p-space-lg font-body-md text-body-md text-on-surface-variant">
                {allCount === 0 && !params.q && !params.source ? t('empty') : t('noMatch')}
              </p>
            ) : (
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant uppercase">
                    <th scope="col" className="px-space-md py-space-sm">
                      {t('colProduct')}
                    </th>
                    <th scope="col" className="px-space-md py-space-sm">
                      {t('colSource')}
                    </th>
                    <th scope="col" className="px-space-md py-space-sm">
                      {t('colPrice')}
                    </th>
                    <th scope="col" className="px-space-md py-space-sm">
                      {t('colStock')}
                    </th>
                    <th scope="col" className="px-space-md py-space-sm">
                      {t('colNote')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => {
                    const price = formatCatalogPrice(row);
                    const state = stockState(row.stock);
                    const sourceKey = catalogSourceKey(row.source);
                    return (
                      <tr key={row.id} className="border-t border-outline-variant align-top">
                        <td className="px-space-md py-space-md">
                          <div className="flex items-start gap-space-sm">
                            <span className="mt-0.5 w-9 h-9 shrink-0 rounded-lg bg-surface-container-low text-on-surface-variant flex items-center justify-center">
                              <Icon name="inventory_2" size={18} />
                            </span>
                            <div className="min-w-0">
                              <div className="font-title-sm text-title-sm text-on-surface break-words">
                                {row.name}
                              </div>
                              <div className="font-code-sm text-code-sm text-on-surface-variant break-words">
                                {[
                                  row.sku ? `SKU: ${row.sku}` : null,
                                  row.category,
                                  row.variantCount > 0
                                    ? t('variants', { count: row.variantCount })
                                    : null,
                                ]
                                  .filter((part) => part)
                                  .join(' • ')}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-space-md py-space-md">
                          <span className="inline-flex px-2 py-0.5 rounded bg-surface-container-low text-on-surface font-label-sm text-label-sm">
                            {t(SOURCE_LABEL_KEY[sourceKey])}
                          </span>
                        </td>
                        <td className="px-space-md py-space-md font-body-md text-body-md">
                          {price ? (
                            <div>
                              <div className="font-title-sm text-title-sm text-on-surface">
                                {price.price}
                              </div>
                              {price.compareAt ? (
                                <div className="text-on-surface-variant line-through">
                                  {price.compareAt}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-on-surface-variant">{t('noPrice')}</span>
                          )}
                        </td>
                        <td className="px-space-md py-space-md font-body-md text-body-md">
                          {state === 'in' ? t('stockIn', { count: row.stock ?? 0 }) : null}
                          {state === 'low' ? t('stockLow', { count: row.stock ?? 0 }) : null}
                          {state === 'out' ? t('stockOut') : null}
                          {state === 'unknown' ? (
                            <span className="text-on-surface-variant">{t('stockUnknown')}</span>
                          ) : null}
                        </td>
                        <td className="px-space-md py-space-md font-body-sm text-body-sm text-on-surface-variant">
                          {t('noteSoon')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {list.total > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t('range', { from: range.from, to: range.to, total: list.total })}
              </p>
              <div className="flex items-center gap-2">
                {params.page > 1 ? (
                  <Link
                    href={catalogHref({ ...params, page: params.page - 1 })}
                    className={TAB_OFF}
                  >
                    {t('prev')}
                  </Link>
                ) : null}
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {t('pageOf', { page: params.page, pages: range.pages })}
                </span>
                {params.page < range.pages ? (
                  <Link
                    href={catalogHref({ ...params, page: params.page + 1 })}
                    className={TAB_OFF}
                  >
                    {t('next')}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </KbFrame>
    </main>
  );
}

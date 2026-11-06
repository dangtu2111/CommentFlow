import type { ImportProductPlan } from './product-import/plan';

/**
 * Đối soát Shopify ↔ kho nội bộ (FR-112/113, `docs/09` §7.3, Q-SRC1). Hàm THUẦN: chỉ SO SÁNH và trả danh sách lệch +
 * cảnh báo. Không có đường sửa dữ liệu — nguyên tắc #4: giá/tồn chỉ đổi khi Owner duyệt (hoặc webhook thường lệ).
 */

/** Lệch > 5% số sản phẩm → cảnh báo Admin (docs/09 §7.3). */
export const RECONCILE_ADMIN_RATIO = 0.05;
/** "Đối soát ngay" tối đa 1 lần/giờ. */
export const RECONCILE_MANUAL_COOLDOWN_MS = 60 * 60 * 1000;
/** Chủ đề webhook (enum `WebhookSubscriptionTopic` của Admin GraphQL) mà tích hợp cần có. */
export const SHOPIFY_REQUIRED_WEBHOOK_TOPICS: readonly string[] = [
  'PRODUCTS_UPDATE',
  'PRODUCTS_DELETE',
  'INVENTORY_LEVELS_UPDATE',
  'APP_UNINSTALLED',
];

export type InternalVariantSnapshot = {
  externalId: string;
  priceVnd: number | null;
  compareAtVnd: number | null;
  stock: number | null;
};
/** Sản phẩm nguồn Shopify đang hoạt động trong kho nội bộ (đọc qua `withJob`, đã lọc workspace). */
export type InternalProductSnapshot = {
  externalId: string;
  name: string;
  variants: InternalVariantSnapshot[];
};

export type ReconcileDiffKind = 'price' | 'compare_at' | 'stock' | 'name' | 'gone_in_shopify';
export type ReconcileDiff = {
  kind: ReconcileDiffKind;
  productExternalId: string;
  /** `null` khi lệch ở mức sản phẩm (tên, sản phẩm biến mất). */
  variantExternalId: string | null;
  internal: number | string | null;
  shopify: number | string | null;
};

export type ReconcileResult = {
  diffs: ReconcileDiff[];
  summary: {
    productsChecked: number;
    variantsChecked: number;
    diffs: number;
    priceDiffs: number;
    productsWithDiffs: number;
    /** Có ở Shopify mà chưa có nội bộ: chỉ đếm, không ghi đè (việc nhập là của đồng bộ). */
    newInShopify: number;
  };
  alerts: { notifyOwner: boolean; alertAdmin: boolean; diffRatioHigh: boolean };
  /** Có lệch cần Owner duyệt trước khi áp. */
  needsOwnerReview: boolean;
};

const PRICE_KINDS: ReadonlySet<ReconcileDiffKind> = new Set(['price', 'compare_at']);

type DiffCtx = { product: string; variant: string | null; out: ReconcileDiff[] };

/** Chỉ so khi Shopify BIẾT giá trị (null = không VND/không theo dõi tồn → không đoán). */
function compareNumber(
  ctx: DiffCtx,
  kind: ReconcileDiffKind,
  internal: number | null,
  shopify: number | null,
): void {
  if (shopify === null || shopify === internal) return;
  ctx.out.push({
    kind,
    productExternalId: ctx.product,
    variantExternalId: ctx.variant,
    internal,
    shopify,
  });
}

function compareVariant(
  product: string,
  mine: InternalVariantSnapshot,
  theirs: ImportProductPlan['variants'][number],
  out: ReconcileDiff[],
): void {
  const ctx = { product, variant: mine.externalId, out };
  compareNumber(ctx, 'price', mine.priceVnd, theirs.priceVnd);
  compareNumber(ctx, 'compare_at', mine.compareAtVnd, theirs.compareAtVnd);
  compareNumber(ctx, 'stock', mine.stock, theirs.stock);
}

const gone = (product: string, variant: string | null): ReconcileDiff => ({
  kind: 'gone_in_shopify',
  productExternalId: product,
  variantExternalId: variant,
  internal: null,
  shopify: null,
});

/**
 * So danh mục Shopify (`ACTIVE`, đã chuẩn hóa bởi `buildShopifyImportPlan`) với kho nội bộ theo `external_id`.
 * `webhookMissing`: chủ đề webhook thiếu (từ `checkWebhookTopics`) → báo Admin.
 */
export function reconcileCatalog(
  shopify: readonly ImportProductPlan[],
  internal: readonly InternalProductSnapshot[],
  options: { webhookMissing?: readonly string[] } = {},
): ReconcileResult {
  const theirs = new Map(shopify.map((p) => [p.externalId, p]));
  const mine = new Map(internal.map((p) => [p.externalId, p]));
  const diffs: ReconcileDiff[] = [];
  let variantsChecked = 0;
  let newInShopify = 0;

  for (const [id, product] of mine) {
    const remote = theirs.get(id);
    if (remote === undefined) {
      diffs.push(gone(id, null));
      variantsChecked += product.variants.length;
      continue;
    }
    if (remote.name.trim() !== product.name.trim()) {
      diffs.push({
        kind: 'name',
        productExternalId: id,
        variantExternalId: null,
        internal: product.name,
        shopify: remote.name,
      });
    }
    const remoteVariants = new Map(remote.variants.map((v) => [v.externalId, v]));
    const seen = new Set<string>();
    for (const v of product.variants) {
      seen.add(v.externalId);
      variantsChecked += 1;
      const other = remoteVariants.get(v.externalId);
      if (other === undefined) diffs.push(gone(id, v.externalId));
      else compareVariant(id, v, other, diffs);
    }
    for (const key of remoteVariants.keys()) {
      if (!seen.has(key)) {
        newInShopify += 1;
        variantsChecked += 1;
      }
    }
  }
  for (const [id, product] of theirs) {
    if (!mine.has(id)) {
      newInShopify += 1;
      variantsChecked += product.variants.length;
    }
  }

  const productsChecked = new Set([...theirs.keys(), ...mine.keys()]).size;
  const productsWithDiffs = new Set(diffs.map((d) => d.productExternalId)).size;
  const priceDiffs = diffs.filter((d) => PRICE_KINDS.has(d.kind)).length;
  const diffRatioHigh =
    productsChecked > 0 && productsWithDiffs / productsChecked > RECONCILE_ADMIN_RATIO;
  return {
    diffs,
    summary: {
      productsChecked,
      variantsChecked,
      diffs: diffs.length,
      priceDiffs,
      productsWithDiffs,
      newInShopify,
    },
    alerts: {
      notifyOwner: priceDiffs > 0,
      alertAdmin: diffRatioHigh || (options.webhookMissing?.length ?? 0) > 0,
      diffRatioHigh,
    },
    needsOwnerReview: diffs.length > 0,
  };
}

/** Chủ đề webhook bắt buộc còn thiếu so với danh sách đã đăng ký (FR-113). */
export function checkWebhookTopics(registered: readonly string[]): {
  ok: boolean;
  missing: string[];
} {
  const have = new Set(registered);
  const missing = SHOPIFY_REQUIRED_WEBHOOK_TOPICS.filter((topic) => !have.has(topic));
  return { ok: missing.length === 0, missing };
}

/** "Đối soát ngay" tối đa 1 lần/giờ (docs/09 §7.3). */
export function canRunManualReconcile(
  lastManualAt: Date | null,
  now: Date,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  if (lastManualAt === null) return { allowed: true };
  const waitMs = lastManualAt.getTime() + RECONCILE_MANUAL_COOLDOWN_MS - now.getTime();
  return waitMs <= 0
    ? { allowed: true }
    : { allowed: false, retryAfterSeconds: Math.ceil(waitMs / 1000) };
}

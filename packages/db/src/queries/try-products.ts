import { type ProductCard, parseProductCard } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Sản phẩm + biến thể THẬT cho ô Thử AI (TRY-AI-REAL lát A, FR-059). Giá/tồn đọc thẳng từ `products`/`product_variants`
 * (nguyên tắc #4), không từ vector. Chỉ sản phẩm `active` của workspace; gọi trong `withActor`/`withWorkspace`.
 */
export type TryProductVariant = {
  id?: string;
  /** Mốc dữ liệu nguồn (ảnh chụp giá, FR-111). */
  updatedFromSourceAt?: Date | null;
  attrs: Record<string, string>;
  attrsNorm: Record<string, string>;
  priceVnd: number | null;
  /** Mã tiền tệ nguồn; khác `VND` thì giá nằm ở `priceMinor` (đơn vị nhỏ nhất, Q-SFP1). Thiếu = `VND`. */
  currencyCode?: string;
  priceMinor?: number | null;
  stock: number | null;
};

export type TryProduct = {
  id: string;
  name: string;
  priceVnd: number | null;
  currencyCode?: string;
  priceMinor?: number | null;
  stock: number | null;
  updatedFromSourceAt?: Date | null;
  variants: TryProductVariant[];
  /** Thẻ sản phẩm (FR-058); dữ liệu hỏng/khóa lạ → bỏ (không đoán). */
  card?: ProductCard;
};

const uuidList = (ids: readonly string[]) =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

/** Số sản phẩm đang bán (không tính nhãn mẫu) — để biết workspace đã có dữ liệu thật chưa. */
export async function countActiveProducts(
  tx: Database,
  workspaceId: string,
  sampleLabel: string,
): Promise<number> {
  const result = await tx.execute<{ n: string }>(sql`
    SELECT count(*) AS n FROM cf.products
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'active' AND NOT starts_with(name, ${sampleLabel})`);
  return Number(result.rows[0]?.n ?? 0);
}

export async function loadTryProducts(
  tx: Database,
  workspaceId: string,
  productIds: readonly string[],
): Promise<TryProduct[]> {
  if (productIds.length === 0) return [];
  const products = await tx.execute<{
    id: string;
    name: string;
    price_vnd: string | null;
    stock: number | null;
    card: unknown;
    currency_code: string;
    price_minor: string | null;
    updated_from_source_at: Date | null;
  }>(sql`
    SELECT id, name, price_vnd, stock, card, currency_code, price_minor, updated_from_source_at FROM cf.products
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'active' AND id IN (${uuidList(productIds)})
     ORDER BY name, id`);
  const variants = await tx.execute<{
    id: string;
    updated_from_source_at: Date | null;
    product_id: string;
    attrs: Record<string, string>;
    attrs_norm: Record<string, string>;
    price_vnd: string | null;
    stock: number | null;
    currency_code: string;
    price_minor: string | null;
  }>(sql`
    SELECT id, updated_from_source_at, product_id, attrs, attrs_norm, price_vnd, stock, currency_code, price_minor FROM cf.product_variants
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'active' AND product_id IN (${uuidList(productIds)})
     ORDER BY product_id, id`);
  const byProduct = new Map<string, TryProductVariant[]>();
  for (const row of variants.rows) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push({
      id: row.id,
      updatedFromSourceAt: row.updated_from_source_at,
      attrs: row.attrs,
      attrsNorm: row.attrs_norm,
      priceVnd: row.price_vnd === null ? null : Number(row.price_vnd),
      currencyCode: row.currency_code,
      priceMinor: row.price_minor === null ? null : Number(row.price_minor),
      stock: row.stock,
    });
    byProduct.set(row.product_id, list);
  }
  return products.rows.map((row) => {
    const parsed = parseProductCard(row.card);
    return {
      id: row.id,
      name: row.name,
      priceVnd: row.price_vnd === null ? null : Number(row.price_vnd),
      currencyCode: row.currency_code,
      priceMinor: row.price_minor === null ? null : Number(row.price_minor),
      stock: row.stock,
      updatedFromSourceAt: row.updated_from_source_at,
      variants: byProduct.get(row.id) ?? [],
      ...(parsed.ok && Object.keys(parsed.card).length > 0 ? { card: parsed.card } : {}),
    };
  });
}

/** Tên các sản phẩm đang bán (tối đa `limit`) để bộ nhận diện của ô Thử AI biết khách đang nhắc sản phẩm nào. */
export async function listTryProductNames(
  tx: Database,
  workspaceId: string,
  sampleLabel: string,
  limit = 300,
): Promise<string[]> {
  const result = await tx.execute<{ name: string }>(sql`
    SELECT name FROM cf.products
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'active' AND NOT starts_with(name, ${sampleLabel})
     ORDER BY updated_at DESC, id LIMIT ${limit}`);
  return result.rows.map((row) => row.name);
}

/** Chính sách + FAQ của workspace (bản đang soạn, đã nhập tay hoặc nạp từ Shopify) cho ô Thử AI, không tính nhãn mẫu. */
export type TryShopText = {
  id: string;
  kind: 'policy' | 'faq';
  /** `vi`/`en`, hoặc `all` = áp dụng mọi ngôn ngữ (ví dụ chính sách nạp từ Shopify). */
  lang: string;
  /** Loại chính sách (`shipping`, `return`, `other`…); FAQ không có. */
  policyKind: string | null;
  title: string;
  text: string;
};

export async function loadTryShopTexts(
  tx: Database,
  workspaceId: string,
  sampleLabel: string,
): Promise<TryShopText[]> {
  const policies = await tx.execute<{
    id: string;
    lang: string;
    kind: string;
    title: string;
    content: string;
  }>(sql`
    SELECT id, lang, kind, title, content FROM cf.policy_items
     WHERE workspace_id = ${workspaceId}::uuid AND NOT starts_with(title, ${sampleLabel})
     ORDER BY updated_at DESC, id LIMIT 200`);
  const faqs = await tx.execute<{ id: string; lang: string; question: string; answer: string }>(sql`
    SELECT id, lang, question, answer FROM cf.faq_items
     WHERE workspace_id = ${workspaceId}::uuid AND NOT starts_with(question, ${sampleLabel})
     ORDER BY updated_at DESC, id LIMIT 200`);
  return [
    ...policies.rows.map((row) => ({
      id: row.id,
      kind: 'policy' as const,
      lang: row.lang,
      policyKind: row.kind,
      title: row.title,
      text: row.content,
    })),
    ...faqs.rows.map((row) => ({
      id: row.id,
      kind: 'faq' as const,
      lang: row.lang,
      policyKind: null,
      title: row.question,
      text: row.answer,
    })),
  ];
}

import {
  type BrandVoiceInput,
  type FaqItemInput,
  type PolicyItemInput,
  type ShopBranch,
  type ShopContacts,
  type ShopHours,
  type ShopProfileInput,
  type ShopProfileV2,
  shopBranchesSchema,
  shopContactsSchema,
  shopHoursSchema,
} from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Ghi/đọc kiến thức nhập tay (FR-050): thông tin shop, chính sách, FAQ, giọng văn. Đầu vào PHẢI đã qua
 * `parse*` của `@flow/shared`. Gọi trong `withActor` (Owner) hoặc `withJob`; RLS chặn vai trò khác (migration 0036).
 * Không ghi chunk/embedding: việc đó thuộc KB-CHUNKING (worker).
 */
export async function upsertShopProfile(
  tx: Database,
  workspaceId: string,
  input: ShopProfileInput,
  v2?: ShopProfileV2,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO cf.shop_profiles (workspace_id, lang, name, description, address, opening_hours, contact, website)
    VALUES (${workspaceId}::uuid, ${input.lang}, ${input.name}, ${input.description}, ${input.address},
            ${input.openingHours}, ${input.contact}, ${input.website})
    ON CONFLICT (workspace_id, lang) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description, address = EXCLUDED.address,
      opening_hours = EXCLUDED.opening_hours, contact = EXCLUDED.contact, website = EXCLUDED.website,
      updated_at = now()`);
  // Trường mới (KB-SHOP-V2): chỉ ghi khi form gửi kèm; đường cũ (không `v2`) giữ nguyên giá trị đang có.
  if (!v2) return;
  await tx.execute(sql`
    UPDATE cf.shop_profiles SET
      slogan = ${v2.slogan}, industries = ${textArray(v2.industries)},
      legal_name = ${v2.legalName}, tax_id = ${v2.taxId},
      hours = ${v2.hours ? JSON.stringify(v2.hours) : null}::jsonb,
      contacts = ${v2.contacts ? JSON.stringify(v2.contacts) : null}::jsonb,
      branches = ${JSON.stringify(v2.branches)}::jsonb
    WHERE workspace_id = ${workspaceId}::uuid AND lang = ${input.lang}`);
}

export async function upsertBrandVoice(
  tx: Database,
  workspaceId: string,
  input: BrandVoiceInput,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO cf.brand_voice (workspace_id, lang, tone, greeting, sign_off, "do", dont, address_by_name,
      shop_pronoun, shop_pronoun_custom, customer_address, handoff_templates)
    VALUES (${workspaceId}::uuid, ${input.lang}, ${input.tone}, ${input.greeting}, ${input.signOff},
      ${textArray(input.doRules)}, ${textArray(input.dontRules)}, ${input.addressByName},
      ${input.shopPronoun}, ${input.shopPronounCustom ?? null}, ${input.customerAddress},
      ${JSON.stringify(input.handoffTemplates)}::jsonb)
    ON CONFLICT (workspace_id, lang) DO UPDATE SET
      tone = EXCLUDED.tone, greeting = EXCLUDED.greeting, sign_off = EXCLUDED.sign_off, "do" = EXCLUDED."do",
      dont = EXCLUDED.dont, address_by_name = EXCLUDED.address_by_name, shop_pronoun = EXCLUDED.shop_pronoun,
      shop_pronoun_custom = EXCLUDED.shop_pronoun_custom, customer_address = EXCLUDED.customer_address,
      handoff_templates = EXCLUDED.handoff_templates, updated_at = now()`);
}

export async function createFaqItem(
  tx: Database,
  workspaceId: string,
  input: FaqItemInput,
): Promise<string> {
  const r = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.faq_items (workspace_id, question, answer, lang, tags)
    VALUES (${workspaceId}::uuid, ${input.question}, ${input.answer}, ${input.lang}, ${textArray(input.tags)})
    RETURNING id`);
  return r.rows[0]?.id as string;
}

/** `false` khi không có dòng (id sai hoặc của workspace khác — RLS giấu): nơi gọi trả 404. */
export async function updateFaqItem(
  tx: Database,
  workspaceId: string,
  id: string,
  input: FaqItemInput,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.faq_items SET question = ${input.question}, answer = ${input.answer}, lang = ${input.lang},
      tags = ${textArray(input.tags)}, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

export async function deleteFaqItem(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const r = await tx.execute(
    sql`DELETE FROM cf.faq_items WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`,
  );
  return (r.rowCount ?? 0) > 0;
}

export async function createPolicyItem(
  tx: Database,
  workspaceId: string,
  input: PolicyItemInput,
): Promise<string> {
  const r = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.policy_items (workspace_id, kind, lang, title, content)
    VALUES (${workspaceId}::uuid, ${input.kind}, ${input.lang}, ${input.title}, ${input.content})
    RETURNING id`);
  return r.rows[0]?.id as string;
}

export async function updatePolicyItem(
  tx: Database,
  workspaceId: string,
  id: string,
  input: Pick<PolicyItemInput, 'title' | 'content'>,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.policy_items SET title = ${input.title}, content = ${input.content}, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

export async function deletePolicyItem(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const r = await tx.execute(
    sql`DELETE FROM cf.policy_items WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`,
  );
  return (r.rowCount ?? 0) > 0;
}

/** Mảng text của Postgres từ mảng JS (tham số hóa, không nối chuỗi). */
function textArray(values: readonly string[]) {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

// ---------------------------------------------------------------------------------------------------------------
// Đọc cho trang Cơ sở kiến thức (Owner). Gọi trong `withActor`; RLS cô lập workspace. Không đọc chunk/embedding.
// ---------------------------------------------------------------------------------------------------------------

export type KbContentLang = 'vi' | 'en' | 'all';

export type KbFaqRow = {
  id: string;
  question: string;
  answer: string;
  lang: KbContentLang;
  tags: string[];
  updatedAt: Date;
  /** Chỉ FAQ chắt lọc (M3-2): đoạn nguồn thô và loại (`faq` | `product_attr`). FAQ nhập tay: null / `faq`. */
  sourceChunkId: string | null;
  kind: string;
};

export type KbPolicyRow = {
  id: string;
  kind: 'shipping' | 'return' | 'warranty' | 'payment' | 'other';
  lang: KbContentLang;
  title: string;
  content: string;
  updatedAt: Date;
};

export type KbShopProfileRow = {
  lang: KbContentLang;
  name: string;
  description: string | null;
  address: string | null;
  openingHours: string | null;
  contact: string | null;
  website: string | null;
  slogan: string | null;
  industries: string[];
  legalName: string | null;
  taxId: string | null;
  hours: ShopHours | null;
  contacts: ShopContacts | null;
  branches: ShopBranch[];
};

export type KbBrandVoiceRow = {
  lang: 'vi' | 'en';
  tone: string | null;
  greeting: string | null;
  signOff: string | null;
  doRules: string[];
  dontRules: string[];
  addressByName: boolean;
  shopPronoun: string;
  shopPronounCustom: string | null;
  customerAddress: string;
  handoffTemplates: Record<string, { inHours: string; outHours: string }>;
};

/** Nhãn của dữ liệu MẪU do seed dev tạo (AGENTS.md § Thiết kế giao diện): trang tổng quan KHÔNG đếm/hiển thị các dòng này. */
export const SAMPLE_LABEL = '[MẪU]';

const asDate = (value: string | Date): Date => (value instanceof Date ? value : new Date(value));

export async function listFaqItems(tx: Database, workspaceId: string): Promise<KbFaqRow[]> {
  const r = await tx.execute<{
    id: string;
    question: string;
    answer: string;
    lang: KbContentLang;
    tags: string[];
    updated_at: string | Date;
    source_chunk_id: string | null;
    kind: string;
  }>(sql`
    SELECT id, question, answer, lang, tags, updated_at, source_chunk_id, kind FROM cf.faq_items
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'published' ORDER BY updated_at DESC, id`);
  return r.rows.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    lang: row.lang,
    tags: row.tags,
    updatedAt: asDate(row.updated_at),
    sourceChunkId: row.source_chunk_id,
    kind: row.kind,
  }));
}

export async function listPolicyItems(tx: Database, workspaceId: string): Promise<KbPolicyRow[]> {
  const r = await tx.execute<{
    id: string;
    kind: KbPolicyRow['kind'];
    lang: KbContentLang;
    title: string;
    content: string;
    updated_at: string | Date;
  }>(sql`
    SELECT id, kind, lang, title, content, updated_at FROM cf.policy_items
     WHERE workspace_id = ${workspaceId}::uuid ORDER BY kind, updated_at DESC, id`);
  return r.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    lang: row.lang,
    title: row.title,
    content: row.content,
    updatedAt: asDate(row.updated_at),
  }));
}

/** JSON trong DB đã được CHECK hình dạng; vẫn qua Zod khi đọc — hỏng thì bỏ qua trường đó (không làm sập trang). */
function readJson<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  value: unknown,
  fallback: T,
): T {
  if (value === null || value === undefined) return fallback;
  const r = schema.safeParse(value);
  return r.success ? (r.data as T) : fallback;
}

export async function listShopProfiles(
  tx: Database,
  workspaceId: string,
): Promise<KbShopProfileRow[]> {
  const r = await tx.execute<{
    lang: KbContentLang;
    name: string;
    description: string | null;
    address: string | null;
    opening_hours: string | null;
    contact: string | null;
    website: string | null;
    slogan: string | null;
    industries: string[];
    legal_name: string | null;
    tax_id: string | null;
    hours: unknown;
    contacts: unknown;
    branches: unknown;
  }>(sql`
    SELECT lang, name, description, address, opening_hours, contact, website,
           slogan, industries, legal_name, tax_id, hours, contacts, branches
      FROM cf.shop_profiles
     WHERE workspace_id = ${workspaceId}::uuid ORDER BY lang`);
  return r.rows.map((row) => ({
    lang: row.lang,
    name: row.name,
    description: row.description,
    address: row.address,
    openingHours: row.opening_hours,
    contact: row.contact,
    website: row.website,
    slogan: row.slogan,
    industries: row.industries ?? [],
    legalName: row.legal_name,
    taxId: row.tax_id,
    hours: readJson<ShopHours | null>(shopHoursSchema, row.hours, null),
    contacts: readJson<ShopContacts | null>(shopContactsSchema, row.contacts, null),
    branches: readJson<ShopBranch[]>(shopBranchesSchema, row.branches, []),
  }));
}

export async function listBrandVoices(
  tx: Database,
  workspaceId: string,
): Promise<KbBrandVoiceRow[]> {
  const r = await tx.execute<{
    lang: 'vi' | 'en';
    tone: string | null;
    greeting: string | null;
    sign_off: string | null;
    do: string[];
    dont: string[];
    address_by_name: boolean;
    shop_pronoun: string;
    shop_pronoun_custom: string | null;
    customer_address: string;
    handoff_templates: KbBrandVoiceRow['handoffTemplates'];
  }>(sql`
    SELECT lang, tone, greeting, sign_off, "do", dont, address_by_name, shop_pronoun, shop_pronoun_custom,
           customer_address, handoff_templates
      FROM cf.brand_voice WHERE workspace_id = ${workspaceId}::uuid ORDER BY lang`);
  return r.rows.map((row) => ({
    lang: row.lang,
    tone: row.tone,
    greeting: row.greeting,
    signOff: row.sign_off,
    doRules: row.do,
    dontRules: row.dont,
    addressByName: row.address_by_name,
    shopPronoun: row.shop_pronoun,
    shopPronounCustom: row.shop_pronoun_custom,
    customerAddress: row.customer_address,
    handoffTemplates: row.handoff_templates,
  }));
}

export type KbSourceRow = {
  id: string;
  type: string;
  title: string;
  originUrl: string | null;
  status: string;
  lastSyncedAt: Date | null;
  syncError: string | null;
};

export type KbSampleProduct = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  priceVnd: number | null;
  stock: number | null;
  variantCount: number;
  /** Tên các loại biến thể theo thuộc tính (ví dụ Size: S, M, L), đọc từ bản gốc biến thể; rỗng khi sản phẩm không có thuộc tính. */
  variantOptions: Array<{ name: string; values: string[] }>;
  /** Ảnh đại diện từ nguồn ngoài (URL https); `null` khi chưa có. */
  imageUrl: string | null;
  /** Nguồn dữ liệu (`manual`, `shopify`…): khác `manual` thì giá/tồn do nguồn ngoài giữ (khóa sửa tay). */
  source: string;
  /** Đã có vector tên sản phẩm (FR-127). */
  hasEmbedding: boolean;
};

export type KbOverview = {
  counts: {
    products: number;
    policies: number;
    faqs: number;
    shopProfiles: number;
    brandVoices: number;
    sources: number;
  };
  sources: KbSourceRow[];
  /** Sản phẩm đang bán mới cập nhật gần nhất (giá/tồn đọc từ `products`, không từ vector — nguyên tắc #4). */
  sampleProduct: KbSampleProduct | null;
};

/** Số liệu THẬT cho trang tổng quan "Nguồn dữ liệu": đếm theo bảng, danh sách nguồn (chưa xóa), một sản phẩm mẫu. */
/** Gom thuộc tính của các biến thể (`products.variants[].attrs`) thành `{tên thuộc tính → các giá trị khác nhau}`, giữ thứ tự gặp. Hàm thuần. */
export function variantOptionsOf(variants: unknown): Array<{ name: string; values: string[] }> {
  if (!Array.isArray(variants)) return [];
  const byName = new Map<string, Set<string>>();
  for (const variant of variants) {
    const attrs = (variant as { attrs?: unknown } | null)?.attrs;
    if (typeof attrs !== 'object' || attrs === null) continue;
    for (const [name, value] of Object.entries(attrs)) {
      if (typeof value !== 'string' || value.trim() === '') continue;
      const values = byName.get(name) ?? new Set<string>();
      values.add(value.trim());
      byName.set(name, values);
    }
  }
  return [...byName].map(([name, values]) => ({ name, values: [...values] }));
}

export async function loadKbOverview(tx: Database, workspaceId: string): Promise<KbOverview> {
  const [counts, sources, sample] = await Promise.all([
    tx.execute<{
      products: string;
      policies: string;
      faqs: string;
      shop_profiles: string;
      brand_voices: string;
      sources: string;
    }>(sql`
      SELECT
        (SELECT count(*) FROM cf.products WHERE workspace_id = ${workspaceId}::uuid AND status = 'active' AND NOT starts_with(name, ${SAMPLE_LABEL})) AS products,
        (SELECT count(*) FROM cf.policy_items WHERE workspace_id = ${workspaceId}::uuid AND NOT starts_with(title, ${SAMPLE_LABEL})) AS policies,
        (SELECT count(*) FROM cf.faq_items WHERE workspace_id = ${workspaceId}::uuid AND status = 'published' AND NOT starts_with(question, ${SAMPLE_LABEL})) AS faqs,
        (SELECT count(*) FROM cf.shop_profiles WHERE workspace_id = ${workspaceId}::uuid AND NOT starts_with(name, ${SAMPLE_LABEL})) AS shop_profiles,
        (SELECT count(*) FROM cf.brand_voice WHERE workspace_id = ${workspaceId}::uuid) AS brand_voices,
        (SELECT count(*) FROM cf.kb_sources WHERE workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL AND NOT starts_with(title, ${SAMPLE_LABEL})) AS sources`),
    tx.execute<{
      id: string;
      type: string;
      title: string;
      origin_url: string | null;
      status: string;
      last_synced_at: string | Date | null;
      sync_error: string | null;
    }>(sql`
      SELECT id, type, title, origin_url, status, last_synced_at, sync_error FROM cf.kb_sources
       WHERE workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL AND NOT starts_with(title, ${SAMPLE_LABEL})
       ORDER BY created_at DESC, id LIMIT 50`),
    tx.execute<{
      id: string;
      name: string;
      sku: string | null;
      category: string | null;
      price_vnd: string | null;
      stock: number | null;
      variants: unknown;
      image_url: string | null;
      source: string;
      has_embedding: boolean;
    }>(sql`
      SELECT id, name, sku, category, price_vnd, stock, variants, image_url, source,
             name_embedding IS NOT NULL AS has_embedding FROM cf.products
       WHERE workspace_id = ${workspaceId}::uuid AND status = 'active' AND NOT starts_with(name, ${SAMPLE_LABEL})
       ORDER BY updated_at DESC, id LIMIT 1`),
  ]);
  const c = counts.rows[0];
  const product = sample.rows[0];
  return {
    counts: {
      products: Number(c?.products ?? 0),
      policies: Number(c?.policies ?? 0),
      faqs: Number(c?.faqs ?? 0),
      shopProfiles: Number(c?.shop_profiles ?? 0),
      brandVoices: Number(c?.brand_voices ?? 0),
      sources: Number(c?.sources ?? 0),
    },
    sources: sources.rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      originUrl: row.origin_url,
      status: row.status,
      lastSyncedAt: row.last_synced_at === null ? null : asDate(row.last_synced_at),
      syncError: row.sync_error,
    })),
    sampleProduct: product
      ? {
          id: product.id,
          name: product.name,
          sku: product.sku,
          category: product.category,
          priceVnd: product.price_vnd === null ? null : Number(product.price_vnd),
          stock: product.stock,
          variantCount: Array.isArray(product.variants) ? product.variants.length : 0,
          variantOptions: variantOptionsOf(product.variants),
          imageUrl: product.image_url,
          source: product.source,
          hasEmbedding: product.has_embedding,
        }
      : null,
  };
}

import {
  mergeContactText,
  type ShopSuggestionField,
  type ShopSuggestionInsert,
} from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * KB-SHOP-V2 PR5: đề xuất giá trị cho "Thông tin cửa hàng" (từ Shopify hoặc đoạn văn thô). Hệ thống (`withJob`) chỉ chèn NHÁP (RLS + trigger
 * `shop_profile_suggestions_guard`); Owner (`withActor`) Áp dụng/Bỏ. Áp dụng ghi đúng một ô của hồ sơ; không bao giờ ghi lặng lẽ.
 */
export type ShopSuggestionRow = {
  id: string;
  lang: 'vi' | 'en' | 'all';
  field: ShopSuggestionField;
  value: string;
  evidenceQuote: string | null;
  source: 'shopify' | 'kb_text';
  sourceRef: string | null;
};

type Row = {
  id: string;
  lang: ShopSuggestionRow['lang'];
  field: ShopSuggestionField;
  value: string;
  evidence_quote: string | null;
  source: ShopSuggestionRow['source'];
  source_ref: string | null;
};

const toRow = (r: Row): ShopSuggestionRow => ({
  id: r.id,
  lang: r.lang,
  field: r.field,
  value: r.value,
  evidenceQuote: r.evidence_quote,
  source: r.source,
  sourceRef: r.source_ref,
});

/** Nháp chờ quyết định (thành viên đọc được; RLS lọc workspace). */
export async function listDraftShopSuggestions(
  tx: Database,
  workspaceId: string,
): Promise<ShopSuggestionRow[]> {
  const r = await tx.execute<Row>(sql`
    SELECT id, lang, field, value, evidence_quote, source, source_ref FROM cf.shop_profile_suggestions
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'draft'
     ORDER BY lang, field, source LIMIT 200`);
  return r.rows.map(toRow);
}

/** Cột của `shop_profiles` ứng với trường đề xuất ghi thẳng một cột (danh sách trắng — không nối chuỗi từ dữ liệu ngoài). */
const COLUMN_OF = {
  name: sql`name`,
  slogan: sql`slogan`,
  description: sql`description`,
  address: sql`address`,
  opening_hours: sql`opening_hours`,
  legal_name: sql`legal_name`,
  tax_id: sql`tax_id`,
  website: sql`website`,
} as const;
const CONTACT_KEY = { zalo: 'zalo', shopee: 'shopee', tiktok: 'tiktok' } as const;

/** Hồ sơ hiện đã có giá trị này cho trường này chưa (không đề xuất lại giá trị trùng). */
async function profileHasValue(
  tx: Database,
  workspaceId: string,
  item: ShopSuggestionInsert,
): Promise<boolean> {
  const where = sql`workspace_id = ${workspaceId}::uuid AND lang = ${item.lang}`;
  const field = item.field;
  if (field in COLUMN_OF) {
    const col = COLUMN_OF[field as keyof typeof COLUMN_OF];
    const r = await tx.execute(
      sql`SELECT 1 FROM cf.shop_profiles WHERE ${where} AND ${col} = ${item.value}`,
    );
    return r.rows.length > 0;
  }
  if (field === 'hotline' || field === 'email') {
    const r = await tx.execute(
      sql`SELECT 1 FROM cf.shop_profiles WHERE ${where} AND position(${item.value} in coalesce(contact, '')) > 0`,
    );
    return r.rows.length > 0;
  }
  const key = CONTACT_KEY[field as keyof typeof CONTACT_KEY];
  const r = await tx.execute(
    sql`SELECT 1 FROM cf.shop_profiles WHERE ${where} AND contacts ->> ${key}::text = ${item.value}`,
  );
  return r.rows.length > 0;
}

/**
 * Ghi các đề xuất thành NHÁP (mỗi (workspace, ngôn ngữ, trường, nguồn) tối đa một nháp: chạy lại thì làm mới nháp cũ). Bỏ qua giá trị đã bị Bỏ/đã Áp dụng trước đó
 * và giá trị trùng hồ sơ hiện có. Trả số đề xuất thực sự ghi.
 */
export async function replaceShopSuggestionDrafts(
  tx: Database,
  workspaceId: string,
  items: readonly ShopSuggestionInsert[],
): Promise<number> {
  let written = 0;
  for (const item of items) {
    const decided = await tx.execute(sql`
      SELECT 1 FROM cf.shop_profile_suggestions
       WHERE workspace_id = ${workspaceId}::uuid AND lang = ${item.lang} AND field = ${item.field}
         AND source = ${item.source} AND value = ${item.value} AND status <> 'draft'`);
    if (decided.rows.length > 0) continue;
    if (await profileHasValue(tx, workspaceId, item)) continue;
    await tx.execute(sql`
      INSERT INTO cf.shop_profile_suggestions (workspace_id, lang, field, value, evidence_quote, source, source_ref, status)
      VALUES (${workspaceId}::uuid, ${item.lang}, ${item.field}, ${item.value}, ${item.evidenceQuote ?? null},
              ${item.source}, ${item.sourceRef ?? null}, 'draft')
      ON CONFLICT (workspace_id, lang, field, source) WHERE status = 'draft'
      DO UPDATE SET value = EXCLUDED.value, evidence_quote = EXCLUDED.evidence_quote, source_ref = EXCLUDED.source_ref`);
    written += 1;
  }
  return written;
}

export type ShopSuggestionDecision =
  | 'applied'
  | 'rejected'
  | 'not_found'
  | 'no_profile'
  | 'too_long';

/**
 * Owner quyết định một nháp. `applied`: ghi giá trị vào đúng ô của hồ sơ cùng ngôn ngữ (hotline/email nối vào "Liên hệ công khai";
 * Zalo/Shopee/TikTok vào `contacts`; thiếu hồ sơ thì chỉ `name` tạo được hồ sơ), rồi đánh dấu `applied`. `rejected`: chỉ đánh dấu.
 * Không đổi gì và trả `not_found` nếu không phải nháp của workspace này (RLS giấu workspace khác; Staff bị RLS chặn nên cũng `not_found`).
 */
export async function decideShopSuggestion(
  tx: Database,
  workspaceId: string,
  id: string,
  decision: 'applied' | 'rejected',
): Promise<ShopSuggestionDecision> {
  const found = await tx.execute<Row>(sql`
    SELECT id, lang, field, value, evidence_quote, source, source_ref FROM cf.shop_profile_suggestions
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'
       AND ${sql`(SELECT core.is_workspace_owner())`}`);
  const row = found.rows[0];
  if (!row) return 'not_found';
  if (decision === 'applied') {
    const outcome = await applyToProfile(tx, workspaceId, toRow(row));
    if (outcome !== 'applied') return outcome;
  }
  const marked = await tx.execute(sql`
    UPDATE cf.shop_profile_suggestions SET status = ${decision}
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'
    RETURNING id`);
  return marked.rows.length > 0 ? decision : 'not_found';
}

async function applyToProfile(
  tx: Database,
  workspaceId: string,
  s: ShopSuggestionRow,
): Promise<'applied' | 'no_profile' | 'too_long'> {
  const where = sql`workspace_id = ${workspaceId}::uuid AND lang = ${s.lang}`;
  const current = await tx.execute<{ contact: string | null }>(
    sql`SELECT contact FROM cf.shop_profiles WHERE ${where}`,
  );
  const profile = current.rows[0];
  if (!profile) {
    if (s.field !== 'name') return 'no_profile';
    await tx.execute(sql`
      INSERT INTO cf.shop_profiles (workspace_id, lang, name)
      VALUES (${workspaceId}::uuid, ${s.lang}, ${s.value})`);
    return 'applied';
  }
  if (s.field in COLUMN_OF) {
    const col = COLUMN_OF[s.field as keyof typeof COLUMN_OF];
    await tx.execute(
      sql`UPDATE cf.shop_profiles SET ${col} = ${s.value}, updated_at = now() WHERE ${where}`,
    );
    return 'applied';
  }
  if (s.field === 'hotline' || s.field === 'email') {
    const merged = mergeContactText(profile.contact, s.value);
    if (merged === null) return 'too_long';
    await tx.execute(
      sql`UPDATE cf.shop_profiles SET contact = ${merged}, updated_at = now() WHERE ${where}`,
    );
    return 'applied';
  }
  const key = CONTACT_KEY[s.field as keyof typeof CONTACT_KEY];
  await tx.execute(sql`
    UPDATE cf.shop_profiles
       SET contacts = coalesce(contacts, '{}'::jsonb) || jsonb_build_object(${key}::text, ${s.value}::text), updated_at = now()
     WHERE ${where}`);
  return 'applied';
}

/**
 * Như `replaceShopSuggestionDrafts` nhưng nhân mỗi đề xuất ra TỪNG ngôn ngữ đã có hồ sơ (đề xuất hiện dưới ô của hồ sơ đó); chưa có hồ sơ nào → chỉ `vi`
 * (Owner Áp dụng "tên" sẽ tạo hồ sơ). Giá trị `lang` truyền vào bị thay.
 */
export async function replaceShopSuggestionDraftsForProfiles(
  tx: Database,
  workspaceId: string,
  items: readonly ShopSuggestionInsert[],
): Promise<number> {
  const r = await tx.execute<{ lang: ShopSuggestionInsert['lang'] }>(
    sql`SELECT lang FROM cf.shop_profiles WHERE workspace_id = ${workspaceId}::uuid ORDER BY lang`,
  );
  const langs = r.rows.length > 0 ? r.rows.map((row) => row.lang) : (['vi'] as const);
  return replaceShopSuggestionDrafts(
    tx,
    workspaceId,
    items.flatMap((item) => langs.map((lang) => ({ ...item, lang }))),
  );
}

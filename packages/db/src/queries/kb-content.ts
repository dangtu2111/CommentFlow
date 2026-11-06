import type {
  BrandVoiceInput,
  FaqItemInput,
  PolicyItemInput,
  ShopProfileInput,
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
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO cf.shop_profiles (workspace_id, lang, name, description, address, opening_hours, contact, website)
    VALUES (${workspaceId}::uuid, ${input.lang}, ${input.name}, ${input.description}, ${input.address},
            ${input.openingHours}, ${input.contact}, ${input.website})
    ON CONFLICT (workspace_id, lang) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description, address = EXCLUDED.address,
      opening_hours = EXCLUDED.opening_hours, contact = EXCLUDED.contact, website = EXCLUDED.website,
      updated_at = now()`);
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

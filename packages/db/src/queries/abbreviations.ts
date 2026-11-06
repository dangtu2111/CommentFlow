import {
  type AbbreviationEntry,
  type AbbreviationInput,
  type AbbreviationLang,
  mergeAbbreviations,
} from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Từ điển viết tắt (FR-025, FR-050, migration 0041). Đầu vào PHẢI đã qua `parseAbbreviation` (`@flow/shared`).
 * Ghi: `withActor` (Owner) hoặc `withJob`; RLS chặn Staff/workspace khác. Đọc từ điển hệ thống (`cf.system_abbreviations`)
 * không cần quyền đặc biệt.
 */
export type WorkspaceAbbreviation = AbbreviationEntry & { id: string; lang: AbbreviationLang };

/** Tạo mục của workspace; trùng (lang, short) → lỗi 23505 (nơi gọi dịch thành thông báo dễ hiểu). Trả `id`. */
export async function createAbbreviation(
  tx: Database,
  workspaceId: string,
  input: AbbreviationInput,
): Promise<string> {
  const r = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.abbreviations (workspace_id, short, full, lang)
    VALUES (${workspaceId}::uuid, ${input.short}, ${input.full}, ${input.lang})
    RETURNING id`);
  const row = r.rows[0];
  if (!row) throw new Error('insert abbreviations không trả dòng nào');
  return row.id;
}

/** Sửa `short`/`full` (không đổi ngôn ngữ). `false` khi id không thấy được (workspace khác, không đủ quyền). */
export async function updateAbbreviation(
  tx: Database,
  workspaceId: string,
  id: string,
  input: Pick<AbbreviationInput, 'short' | 'full'>,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.abbreviations SET short = ${input.short}, full = ${input.full}, updated_at = now()
    WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

export async function deleteAbbreviation(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const r = await tx.execute(
    sql`DELETE FROM cf.abbreviations WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid`,
  );
  return (r.rowCount ?? 0) > 0;
}

/** Mục của workspace (trang quản lý từ điển), sắp theo `short`. RLS giới hạn theo workspace hiện tại. */
export async function listAbbreviations(
  tx: Database,
  workspaceId: string,
  lang?: AbbreviationLang,
): Promise<WorkspaceAbbreviation[]> {
  const r = await tx.execute<WorkspaceAbbreviation>(sql`
    SELECT id, short, full, lang FROM cf.abbreviations
    WHERE workspace_id = ${workspaceId}::uuid ${lang ? sql`AND lang = ${lang}` : sql``}
    ORDER BY lang, short`);
  return r.rows;
}

/** Từ điển hệ thống của một ngôn ngữ. */
export async function listSystemAbbreviations(
  tx: Database,
  lang: AbbreviationLang,
): Promise<AbbreviationEntry[]> {
  const r = await tx.execute<AbbreviationEntry>(
    sql`SELECT short, full FROM cf.system_abbreviations WHERE lang = ${lang} ORDER BY short`,
  );
  return r.rows;
}

/**
 * Từ điển đã trộn cho bước chuẩn hóa: hệ thống + workspace (mục của shop đè). Trả `Record` để đưa thẳng vào
 * `createAbbreviationDict` của `@flow/ai` (db không import ai).
 */
export async function loadAbbreviationEntries(
  tx: Database,
  workspaceId: string,
  lang: AbbreviationLang,
): Promise<Record<string, string>> {
  const [system, own] = await Promise.all([
    listSystemAbbreviations(tx, lang),
    listAbbreviations(tx, workspaceId, lang),
  ]);
  return mergeAbbreviations(system, own);
}

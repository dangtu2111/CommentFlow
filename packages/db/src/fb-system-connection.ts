import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Token System User Facebook của workspace (migration 0086, CHANNELS-SYSTEM-USER). `cf_app` không có quyền ghi bảng nên mọi ghi
 * đi qua các hàm DEFINER ở đây. Gói này CHỈ chuyển ciphertext (bytea): mã hóa/giải mã nằm ở tầng ứng dụng (`@flow/connectors`,
 * khóa `TOKEN_ENC_KEYS`, AAD có workspace).
 *
 * Quyền do DB quyết định: lưu/ngắt = Owner (`withActor`) hoặc hệ thống; ĐỌC ciphertext và đánh dấu hỏng = chỉ hệ thống (`withJob`).
 * Vi phạm → Postgres 42501.
 */
export type FbSystemConnectionStatus = 'connected' | 'invalid' | 'disconnected';

export type FbSystemConnectionRow = { status: FbSystemConnectionStatus; createdAt: Date };

export type FbSystemConnectionToken = { ciphertext: Buffer; keyVersion: number };

const asDate = (value: string | Date): Date => (value instanceof Date ? value : new Date(value));

/** Lưu (hoặc thay) token đã mã hóa: upsert theo workspace, đặt `connected`. */
export async function saveFbSystemConnection(
  tx: Database,
  input: { ciphertext: Buffer; keyVersion: number },
): Promise<void> {
  await tx.execute(
    sql`SELECT cf.save_fb_system_connection(${input.ciphertext}, ${input.keyVersion}::integer)`,
  );
}

/** Ngắt: xóa ciphertext, đặt `disconnected`. Chưa từng lưu → lỗi P0002. Kênh đã kết nối giữ nguyên (dùng token Page riêng). */
export async function disconnectFbSystemConnection(tx: Database): Promise<void> {
  await tx.execute(sql`SELECT cf.disconnect_fb_system_connection()`);
}

/** Trạng thái (không bí mật); `null` nếu workspace chưa từng lưu. Owner/hệ thống thấy được (RLS). */
export async function getFbSystemConnection(
  tx: Database,
  workspaceId: string,
): Promise<FbSystemConnectionRow | null> {
  const r = await tx.execute<{ status: FbSystemConnectionStatus; created_at: string | Date }>(
    sql`SELECT status, created_at FROM cf.fb_system_connections WHERE workspace_id = ${workspaceId}::uuid`,
  );
  const row = r.rows[0];
  return row ? { status: row.status, createdAt: asDate(row.created_at) } : null;
}

/** Đọc ciphertext — CHỈ chạy được trong `withJob`. `null` = chưa lưu / đã ngắt / đã hỏng. */
export async function readFbSystemConnectionToken(
  tx: Database,
): Promise<FbSystemConnectionToken | null> {
  const r = await tx.execute<{ ciphertext: Buffer; key_version: number }>(
    sql`SELECT ciphertext, key_version FROM cf.read_fb_system_connection_token()`,
  );
  const row = r.rows[0];
  return row ? { ciphertext: row.ciphertext, keyVersion: row.key_version } : null;
}

/** Meta từ chối token → `invalid` (giao diện báo cần dán token mới). CHỈ `withJob`. */
export async function markFbSystemConnectionInvalid(tx: Database): Promise<void> {
  await tx.execute(sql`SELECT cf.mark_fb_system_connection_invalid()`);
}

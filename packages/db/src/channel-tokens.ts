import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Lớp gọi bốn hàm DEFINER của token Page (migration 0020, ADR 007 §2). `cf_app` không có quyền cột token nên mọi
 * ghi/đọc token đi qua đây. Gói này CHỈ chuyển ciphertext (bytea) — mã hóa/giải mã nằm ở `@flow/connectors` (khóa env).
 *
 * Quyền do DB quyết định (không phải mã này): tạo/ghi/xóa = Owner đang hoạt động (`withActor`) hoặc hệ thống
 * (`withJob`); ĐỌC ciphertext = chỉ `withJob`. Vi phạm → lỗi Postgres 42501.
 */
export type ChannelTokenRow = { ciphertext: Buffer; keyVersion: number };

export type CreateChannelInput = {
  platform: 'facebook' | 'instagram' | 'tiktok';
  externalId: string;
  name: string;
  avatarUrl?: string | null;
  scopes?: readonly string[];
};

/** Tạo kênh hoặc kết nối lại (upsert theo `(platform, external_id, workspace)`); trả `channel_id` thật của hàng. */
export async function createChannel(tx: Database, input: CreateChannelInput): Promise<string> {
  const scopes = sql`ARRAY[${sql.join(
    (input.scopes ?? []).map((scope) => sql`${scope}`),
    sql`, `,
  )}]::text[]`;
  const result = await tx.execute<{ id: string }>(
    sql`SELECT cf.create_channel(${input.platform}, ${input.externalId}, ${input.name}, ${input.avatarUrl ?? null}, ${scopes}) AS id`,
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('cf.create_channel không trả channel_id');
  return id;
}

/** Ghi ciphertext (đã mã hóa ở tầng ứng dụng với AAD = workspace|channel|key_version) cho kênh. */
export async function setChannelToken(
  tx: Database,
  input: { channelId: string; ciphertext: Buffer; keyVersion: number; expiresAt?: Date | null },
): Promise<void> {
  await tx.execute(
    sql`SELECT cf.set_channel_token(${input.channelId}::uuid, ${input.ciphertext}, ${input.keyVersion}::integer, ${input.expiresAt ?? null}::timestamptz)`,
  );
}

/** Xóa token và đặt kênh `revoked` (ngắt kết nối). */
export async function clearChannelToken(tx: Database, channelId: string): Promise<void> {
  await tx.execute(sql`SELECT cf.clear_channel_token(${channelId}::uuid)`);
}

/** Đọc ciphertext — CHỈ chạy được trong `withJob`. `null` = kênh chưa có token. */
export async function readChannelToken(
  tx: Database,
  channelId: string,
): Promise<ChannelTokenRow | null> {
  const result = await tx.execute<{ ciphertext: Buffer; key_version: number }>(
    sql`SELECT ciphertext, key_version FROM cf.read_channel_token(${channelId}::uuid)`,
  );
  const row = result.rows[0];
  return row ? { ciphertext: Buffer.from(row.ciphertext), keyVersion: row.key_version } : null;
}

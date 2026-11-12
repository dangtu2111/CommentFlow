import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Đặt cờ `webhook_subscribed` của MỘT kênh Facebook đã kết nối (migration 0088). Web chỉ có kết nối cf_app nên `withJob` không phải ngữ cảnh
 * hệ thống (ADR 011) và trigger `guard_channel_user_update` chặn đổi cột này; hàm DEFINER chỉ cho OWNER (hoặc hệ thống) đổi, chỉ trong workspace
 * hiện tại. Nơi gọi chỉ đặt `true` SAU KHI đã xác nhận đăng ký với Meta. Trả `true` nếu đổi được; `false` nếu không có kênh hợp lệ
 * (khác workspace, đã ngắt, không phải Facebook).
 */
export async function setChannelWebhookSubscribed(
  tx: Database,
  channelId: string,
  value: boolean,
): Promise<boolean> {
  const r = await tx.execute<{ ok: boolean }>(
    sql`SELECT cf.set_channel_webhook_subscribed(${channelId}::uuid, ${value}) AS ok`,
  );
  return r.rows[0]?.ok === true;
}

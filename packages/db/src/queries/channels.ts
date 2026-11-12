import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import type { InboxPlatform } from './inbox';

/**
 * Danh sách kênh của workspace cho trang Cài đặt → Kênh (FR-012). CHỈ ĐỌC, cột tường minh (không bao giờ đọc token —
 * `cf_app` cũng không có quyền cột đó); gọi trong `withActor` (RLS: chỉ thành viên đang hoạt động thấy kênh).
 */
export const CHANNEL_CHECK_RESULTS = [
  'ok',
  'webhook_missing',
  'token_invalid',
  'error',
  'unavailable',
] as const;
export type ChannelCheckResult = (typeof CHANNEL_CHECK_RESULTS)[number];

export type ChannelListItem = {
  id: string;
  name: string;
  platform: InboxPlatform;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  webhookSubscribed: boolean;
  replyLanguage: 'auto' | 'vi' | 'en';
  lastCheckedAt: Date | null;
  lastCheckResult: ChannelCheckResult | null;
  /** Quyền nền tảng ĐÃ CẤP cho kênh (worker làm mới ở mỗi lần kiểm kết nối; trước lần kiểm đầu có thể rỗng/chưa đủ tin cậy — xem `lastCheckedAt`). */
  scopes: string[];
};

export async function listChannels(tx: Database, workspaceId: string): Promise<ChannelListItem[]> {
  const result = await tx.execute<{
    id: string;
    name: string;
    platform: InboxPlatform;
    status: ChannelListItem['status'];
    webhook_subscribed: boolean;
    reply_language: ChannelListItem['replyLanguage'];
    last_checked_at: string | Date | null;
    last_check_result: ChannelCheckResult | null;
    scopes: string[];
  }>(sql`
    SELECT ch.id, ch.name, ch.platform, ch.status, ch.webhook_subscribed, ch.reply_language,
           ch.last_checked_at, ch.last_check_result, ch.scopes
      FROM cf.channels ch
     WHERE ch.workspace_id = ${workspaceId}::uuid
     ORDER BY ch.name, ch.id`);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    status: row.status,
    webhookSubscribed: row.webhook_subscribed,
    replyLanguage: row.reply_language,
    lastCheckedAt: row.last_checked_at === null ? null : new Date(row.last_checked_at),
    lastCheckResult: row.last_check_result,
    scopes: row.scopes,
  }));
}

/**
 * Đổi ngôn ngữ trả lời của một kênh (FR-120). Gọi trong `withActor`: RLS + trigger chỉ cho Owner đổi `name`/
 * `reply_language` (ch-rls.int.test.ts); kênh ngoài workspace → 0 dòng → `false`. Không đổi cột nào khác.
 */
export async function setChannelReplyLanguage(
  tx: Database,
  workspaceId: string,
  channelId: string,
  language: ChannelListItem['replyLanguage'],
): Promise<boolean> {
  const result = await tx.execute<{ id: string }>(sql`
    UPDATE cf.channels SET reply_language = ${language}
     WHERE id = ${channelId}::uuid AND workspace_id = ${workspaceId}::uuid
    RETURNING id`);
  return result.rows.length > 0;
}

/** Số liệu hoạt động của MỘT kênh (đọc từ `cf.comments`, bỏ bình luận đã xóa). */
export type ChannelActivityItem = {
  comments24h: number;
  comments7d: number;
  /** Bình luận AI tự trả lời trong 7 ngày (`status = 'auto_replied'`). */
  autoReplied7d: number;
  lastCommentAt: Date | null;
};

export type ChannelActivity = {
  /** Chỉ có khóa cho kênh có ít nhất một bình luận chưa xóa. */
  byChannel: Record<string, ChannelActivityItem>;
  totals: {
    comments24h: number;
    comments7d: number;
    autoReplied7d: number;
    /** Tin nhắn khách gửi tới trong 24 giờ (`messages.direction = 'in'`). */
    messages24h: number;
  };
};

/**
 * Số liệu thật cho trang Cài đặt → Kênh (thẻ "tương tác 24 giờ qua", "AI tự trả lời", "bình luận gần nhất" theo kênh).
 * CHỈ ĐỌC, gọi trong `withActor`/`withWorkspace` (RLS cô lập workspace); không đọc nội dung bình luận/tin nhắn.
 */
export async function loadChannelActivity(
  tx: Database,
  workspaceId: string,
): Promise<ChannelActivity> {
  const [comments, messages] = await Promise.all([
    tx.execute<{
      channel_id: string;
      c24: string;
      c7: string;
      a7: string;
      last_at: string | Date | null;
    }>(sql`
      SELECT channel_id,
             count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS c24,
             count(*) FILTER (WHERE created_at > now() - interval '7 days') AS c7,
             count(*) FILTER (WHERE created_at > now() - interval '7 days' AND status = 'auto_replied') AS a7,
             max(created_at) AS last_at
        FROM cf.comments
       WHERE workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL
       GROUP BY channel_id`),
    tx.execute<{ n: string }>(sql`
      SELECT count(*) AS n
        FROM cf.messages
       WHERE workspace_id = ${workspaceId}::uuid
         AND direction = 'in'
         AND created_time > now() - interval '24 hours'`),
  ]);
  const byChannel: Record<string, ChannelActivityItem> = {};
  const totals = { comments24h: 0, comments7d: 0, autoReplied7d: 0, messages24h: 0 };
  for (const row of comments.rows) {
    const item = {
      comments24h: Number(row.c24),
      comments7d: Number(row.c7),
      autoReplied7d: Number(row.a7),
      lastCommentAt: row.last_at === null ? null : new Date(row.last_at),
    };
    byChannel[row.channel_id] = item;
    totals.comments24h += item.comments24h;
    totals.comments7d += item.comments7d;
    totals.autoReplied7d += item.autoReplied7d;
  }
  totals.messages24h = Number(messages.rows[0]?.n ?? 0);
  return { byChannel, totals };
}

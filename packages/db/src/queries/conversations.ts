import {
  CONVERSATION_AUTO_WINDOW_MS,
  CONVERSATION_HUMAN_WINDOW_MS,
  type ConversationWindowState,
} from '@flow/shared';
import { type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Hội thoại + tin nhắn (FR-047, migration 0058, Q-MSS1). Ghi từ webhook: `withJob` (hệ thống). Đọc/giao việc:
 * `withActor` (thành viên). Cửa sổ 24 giờ/7 ngày KHÔNG lưu cột — lọc bằng mốc thời gian so với `now` do người gọi
 * truyền (cùng quy tắc `conversationWindow`: elapsed ≤ ngưỡng thì còn trong cửa sổ).
 */
export type ConversationStatus = 'open' | 'resolved';
export type MessageDirection = 'in' | 'out';
export type MessageSender = 'customer' | 'staff' | 'ai';

export type ConversationRow = {
  id: string;
  channelId: string;
  externalId: string;
  customerExternalId: string;
  customerName: string | null;
  lastCustomerMsgAt: Date | null;
  lastMessageAt: Date | null;
  status: ConversationStatus;
  aiEnabled: boolean;
  aiDisabledReason: string | null;
  aiTurns: number;
  assignedTo: string | null;
};

export type MessageRow = {
  id: string;
  conversationId: string;
  externalId: string | null;
  direction: MessageDirection;
  text: string | null;
  lang: string | null;
  sentBy: MessageSender;
  tag: 'HUMAN_AGENT' | null;
  createdTime: Date;
};

type RawConversation = {
  id: string;
  channel_id: string;
  external_id: string;
  customer_external_id: string;
  customer_name: string | null;
  last_customer_msg_at: Date | string | null;
  last_message_at: Date | string | null;
  status: ConversationStatus;
  ai_enabled: boolean;
  ai_disabled_reason: string | null;
  ai_turns: number;
  assigned_to: string | null;
};

type RawMessage = {
  id: string;
  conversation_id: string;
  external_id: string | null;
  direction: MessageDirection;
  text: string | null;
  lang: string | null;
  sent_by: MessageSender;
  tag: 'HUMAN_AGENT' | null;
  created_time: Date | string;
};

const toDate = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));

const toConversation = (r: RawConversation): ConversationRow => ({
  id: r.id,
  channelId: r.channel_id,
  externalId: r.external_id,
  customerExternalId: r.customer_external_id,
  customerName: r.customer_name,
  lastCustomerMsgAt: toDate(r.last_customer_msg_at),
  lastMessageAt: toDate(r.last_message_at),
  status: r.status,
  aiEnabled: r.ai_enabled,
  aiDisabledReason: r.ai_disabled_reason,
  aiTurns: r.ai_turns,
  assignedTo: r.assigned_to,
});

const toMessage = (r: RawMessage): MessageRow => ({
  id: r.id,
  conversationId: r.conversation_id,
  externalId: r.external_id,
  direction: r.direction,
  text: r.text,
  lang: r.lang,
  sentBy: r.sent_by,
  tag: r.tag,
  createdTime: new Date(r.created_time),
});

const CONVERSATION_COLUMNS = sql`id, channel_id, external_id, customer_external_id, customer_name,
  last_customer_msg_at, last_message_at, status, ai_enabled, ai_disabled_reason, ai_turns, assigned_to`;

export type InboundMessageInput = {
  channelId: string;
  /** Mã luồng hội thoại của nền tảng. */
  threadExternalId: string;
  /** PSID/IGSID của khách. */
  customerExternalId: string;
  customerName?: string | null;
  /** mid của nền tảng — khóa chống trùng khi webhook gửi lại. */
  messageExternalId: string;
  text: string | null;
  lang?: string | null;
  at: Date;
};

/**
 * Ghi tin KHÁCH gửi tới (hệ thống/webhook): tạo hội thoại nếu chưa có, chèn tin (trùng mid → bỏ qua), rồi chỉ khi tin
 * mới thì đẩy `last_customer_msg_at`/`last_message_at` lên (không bao giờ lùi). Trả `duplicate: true` khi mid đã có.
 * Chỉ `withJob` (RLS: INSERT hội thoại chỉ hệ thống).
 */
export async function recordInboundMessage(
  tx: Database,
  workspaceId: string,
  input: InboundMessageInput,
): Promise<{ conversationId: string; messageId: string | null; duplicate: boolean }> {
  const at = input.at.toISOString();
  const conv = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.conversations (workspace_id, channel_id, external_id, customer_external_id, customer_name)
    VALUES (${workspaceId}::uuid, ${input.channelId}::uuid, ${input.threadExternalId},
      ${input.customerExternalId}, ${input.customerName ?? null})
    ON CONFLICT (channel_id, external_id)
      DO UPDATE SET customer_name = COALESCE(EXCLUDED.customer_name, cf.conversations.customer_name)
    RETURNING id`);
  const conversationId = conv.rows[0]?.id;
  if (!conversationId) throw new Error('upsert cf.conversations không trả dòng nào');

  const msg = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.messages (workspace_id, conversation_id, external_id, direction, text, lang, sent_by, created_time)
    VALUES (${workspaceId}::uuid, ${conversationId}::uuid, ${input.messageExternalId}, 'in', ${input.text},
      ${input.lang ?? null}, 'customer', ${at}::timestamptz)
    ON CONFLICT (workspace_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
    RETURNING id`);
  const messageId = msg.rows[0]?.id ?? null;
  if (messageId === null) return { conversationId, messageId: null, duplicate: true };

  await tx.execute(sql`
    UPDATE cf.conversations SET
      last_customer_msg_at = GREATEST(last_customer_msg_at, ${at}::timestamptz),
      last_message_at = GREATEST(last_message_at, ${at}::timestamptz),
      status = 'open',
      updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${conversationId}::uuid`);
  return { conversationId, messageId, duplicate: false };
}

export type OutboundMessageInput = {
  externalId?: string | null;
  text: string | null;
  lang?: string | null;
  sentBy: 'staff' | 'ai';
  tag?: 'HUMAN_AGENT' | null;
  at?: Date;
};

/**
 * Ghi tin Page gửi đi (nhân viên qua `withActor` hoặc worker qua `withJob`). Không đổi hội thoại (trigger chặn
 * đường người dùng sửa cột thời gian); worker gọi `touchConversationLastMessage` sau khi gửi. Trùng mid → `null`.
 */
export async function recordOutboundMessage(
  tx: Database,
  workspaceId: string,
  conversationId: string,
  input: OutboundMessageInput,
): Promise<string | null> {
  const r = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.messages (workspace_id, conversation_id, external_id, direction, text, lang, sent_by, tag, created_time)
    VALUES (${workspaceId}::uuid, ${conversationId}::uuid, ${input.externalId ?? null}, 'out', ${input.text},
      ${input.lang ?? null}, ${input.sentBy}, ${input.tag ?? null}, COALESCE(${input.at?.toISOString() ?? null}::timestamptz, now()))
    ON CONFLICT (workspace_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
    RETURNING id`);
  return r.rows[0]?.id ?? null;
}

/** Hệ thống: đẩy `last_message_at` lên (không lùi) và tùy chọn tăng số lượt AI. `false` khi không thấy hội thoại. */
export async function touchConversationLastMessage(
  tx: Database,
  workspaceId: string,
  conversationId: string,
  at: Date,
  opts: { aiTurn?: boolean } = {},
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.conversations SET
      last_message_at = GREATEST(last_message_at, ${at.toISOString()}::timestamptz),
      ai_turns = ai_turns + ${opts.aiTurn ? 1 : 0},
      updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${conversationId}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

export async function getConversation(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<ConversationRow | null> {
  const r = await tx.execute<RawConversation>(sql`
    SELECT ${CONVERSATION_COLUMNS} FROM cf.conversations
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`);
  const row = r.rows[0];
  return row ? toConversation(row) : null;
}

export type ConversationFilter = {
  status?: ConversationStatus;
  /** Một user id, hoặc 'unassigned' (chưa giao). */
  assignedTo?: string | 'unassigned';
  window?: ConversationWindowState;
  aiEnabled?: boolean;
  /** Tìm theo tên khách (không phân biệt hoa thường). */
  search?: string;
};

export type ConversationCursor = { lastMessageAt: Date | null; id: string };

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function windowCondition(state: ConversationWindowState, now: Date): SQL {
  const autoFrom = new Date(now.getTime() - CONVERSATION_AUTO_WINDOW_MS).toISOString();
  const humanFrom = new Date(now.getTime() - CONVERSATION_HUMAN_WINDOW_MS).toISOString();
  if (state === 'open') return sql`last_customer_msg_at >= ${autoFrom}::timestamptz`;
  if (state === 'human_only') {
    return sql`last_customer_msg_at < ${autoFrom}::timestamptz AND last_customer_msg_at >= ${humanFrom}::timestamptz`;
  }
  return sql`(last_customer_msg_at IS NULL OR last_customer_msg_at < ${humanFrom}::timestamptz)`;
}

/**
 * Danh sách hội thoại, mới nhất trước (`last_message_at` giảm dần, dòng NULL cuối, rồi `id`), phân trang con trỏ.
 * `limit` bị kẹp 1–100. Trả `nextCursor` khi còn trang sau.
 */
export async function listConversations(
  tx: Database,
  workspaceId: string,
  filter: ConversationFilter,
  opts: { now: Date; limit?: number; cursor?: ConversationCursor },
): Promise<{ items: ConversationRow[]; nextCursor: ConversationCursor | null }> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 30), 1), 100);
  const conds: SQL[] = [sql`workspace_id = ${workspaceId}::uuid`];
  if (filter.status) conds.push(sql`status = ${filter.status}`);
  if (filter.assignedTo === 'unassigned') conds.push(sql`assigned_to IS NULL`);
  else if (filter.assignedTo) conds.push(sql`assigned_to = ${filter.assignedTo}::uuid`);
  if (filter.window) conds.push(windowCondition(filter.window, opts.now));
  if (filter.aiEnabled !== undefined) conds.push(sql`ai_enabled = ${filter.aiEnabled}`);
  const search = filter.search?.trim();
  if (search) conds.push(sql`customer_name ILIKE ${`%${escapeLike(search)}%`} ESCAPE '\\'`);
  const cursor = opts.cursor;
  if (cursor) {
    const id = sql`${cursor.id}::uuid`;
    conds.push(
      cursor.lastMessageAt === null
        ? sql`(last_message_at IS NULL AND id > ${id})`
        : sql`(last_message_at IS NULL OR last_message_at < ${cursor.lastMessageAt.toISOString()}::timestamptz
            OR (last_message_at = ${cursor.lastMessageAt.toISOString()}::timestamptz AND id > ${id}))`,
    );
  }
  const r = await tx.execute<RawConversation>(sql`
    SELECT ${CONVERSATION_COLUMNS} FROM cf.conversations
    WHERE ${sql.join(conds, sql` AND `)}
    ORDER BY last_message_at DESC NULLS LAST, id ASC
    LIMIT ${limit + 1}`);
  const rows = r.rows.map(toConversation);
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      rows.length > limit && last ? { lastMessageAt: last.lastMessageAt, id: last.id } : null,
  };
}

/** `limit` tin MỚI NHẤT của một hội thoại, trả theo thứ tự cũ → mới. `limit` kẹp 1–200. */
export async function listMessages(
  tx: Database,
  workspaceId: string,
  conversationId: string,
  limit = 100,
): Promise<MessageRow[]> {
  const n = Math.min(Math.max(Math.trunc(limit), 1), 200);
  const r = await tx.execute<RawMessage>(sql`
    SELECT id, conversation_id, external_id, direction, text, lang, sent_by, tag, created_time
    FROM cf.messages
    WHERE workspace_id = ${workspaceId}::uuid AND conversation_id = ${conversationId}::uuid
    ORDER BY created_time DESC, id DESC
    LIMIT ${n}`);
  return r.rows.map(toMessage).reverse();
}

/** Giao việc / bỏ giao (null). Người nhận phải là thành viên đang hoạt động (trigger: 23514). `false` khi không thấy. */
export async function assignConversation(
  tx: Database,
  workspaceId: string,
  id: string,
  userId: string | null,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.conversations SET assigned_to = ${userId}::uuid, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

export async function setConversationStatus(
  tx: Database,
  workspaceId: string,
  id: string,
  status: ConversationStatus,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.conversations SET status = ${status}, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

/** Bật/tắt AI theo hội thoại; tắt phải kèm lý do (ví dụ 'human_takeover'), bật xóa lý do. */
export async function setConversationAi(
  tx: Database,
  workspaceId: string,
  id: string,
  enabled: boolean,
  reason: string | null,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.conversations SET ai_enabled = ${enabled},
      ai_disabled_reason = ${enabled ? null : (reason ?? 'manual')}, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

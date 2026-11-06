import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { channels } from './channels';

/**
 * Hội thoại tin nhắn Messenger/IG DM (FR-047, docs/10 §3.2). Một dòng / (kênh, `external_id` của luồng).
 * Cửa sổ 24 giờ/7 ngày KHÔNG lưu cột trạng thái (sẽ cũ theo thời gian): tính từ `last_customer_msg_at` bằng
 * `conversationWindow` (`@flow/shared`) và lọc bằng mốc thời gian ở truy vấn (Q-MSS1).
 */
export const conversations = cf.table(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    externalId: text('external_id').notNull(),
    customerExternalId: text('customer_external_id').notNull(),
    customerName: text('customer_name'),
    lastCustomerMsgAt: timestamptz('last_customer_msg_at'),
    lastMessageAt: timestamptz('last_message_at'),
    status: text('status').notNull().default('open'),
    aiEnabled: boolean('ai_enabled').notNull().default(true),
    aiDisabledReason: text('ai_disabled_reason'),
    aiTurns: integer('ai_turns').notNull().default(0),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'conversations_channel_fk',
      columns: [t.workspaceId, t.channelId],
      foreignColumns: [channels.workspaceId, channels.id],
    }).onDelete('cascade'),
    unique('conversations_channel_external_unique').on(t.channelId, t.externalId),
    unique('conversations_workspace_id_id_unique').on(t.workspaceId, t.id),
    // Khớp ORDER BY của listConversations (mới nhất trước, NULL cuối, rồi id) — có và không lọc status.
    index('conversations_list_idx').on(
      t.workspaceId,
      t.status,
      t.lastMessageAt.desc().nullsLast(),
      t.id,
    ),
    index('conversations_recent_idx').on(t.workspaceId, t.lastMessageAt.desc().nullsLast(), t.id),
    index('conversations_assignee_idx').on(t.workspaceId, t.assignedTo),
    check('conversations_status_check', sql`${t.status} IN ('open', 'resolved')`),
    check('conversations_ai_turns_check', sql`${t.aiTurns} >= 0`),
  ],
);

/**
 * Tin nhắn của hội thoại. `external_id` (mid của nền tảng) là khóa chống trùng khi webhook gửi lại: duy nhất theo
 * (workspace, external_id) khi có giá trị. Tin đi (`out`) chưa có mid vẫn ghi được (external_id NULL).
 */
export const messages = cf.table(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    externalId: text('external_id'),
    direction: text('direction').notNull(),
    text: text('text'),
    lang: text('lang'),
    sentBy: text('sent_by').notNull(),
    tag: text('tag'),
    createdTime: timestamptz('created_time').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'messages_conversation_fk',
      columns: [t.workspaceId, t.conversationId],
      foreignColumns: [conversations.workspaceId, conversations.id],
    }).onDelete('cascade'),
    uniqueIndex('messages_external_unique')
      .on(t.workspaceId, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    index('messages_conversation_idx').on(t.workspaceId, t.conversationId, t.createdTime),
    check('messages_direction_check', sql`${t.direction} IN ('in', 'out')`),
    check('messages_sent_by_check', sql`${t.sentBy} IN ('customer', 'staff', 'ai')`),
    check('messages_tag_check', sql`${t.tag} IS NULL OR ${t.tag} = 'HUMAN_AGENT'`),
    check(
      'messages_direction_sender_check',
      sql`(${t.direction} = 'in') = (${t.sentBy} = 'customer')`,
    ),
  ],
);

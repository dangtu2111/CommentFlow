import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  ATTACHMENT_TYPES,
  normalizeAttachments,
  webhookAttachments,
  withAttachments,
} from '../attachments';
import type { NormalizedEvent, Platform } from '../types';

/**
 * Webhook Facebook Page (docs/12 §1): xác minh chữ ký và chuẩn hóa sự kiện bình luận (`feed`).
 * Không log, không đưa nội dung payload vào thông báo lỗi (có tên khách — nguyên tắc #6).
 */

const SIGNATURE_PREFIX = 'sha256=';
const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/** Chữ ký `X-Hub-Signature-256` của một thân yêu cầu (dùng cho test/script thử webhook). */
export function signMetaBody(rawBody: Buffer, appSecret: string): string {
  return SIGNATURE_PREFIX + createHmac('sha256', appSecret).update(rawBody).digest('hex');
}

/**
 * Kiểm `X-Hub-Signature-256` trên THÂN THÔ (byte nguyên bản, trước khi parse JSON) bằng `META_APP_SECRET`,
 * so sánh thời gian hằng. Mọi đầu vào bậy (thiếu/rỗng/sai định dạng/khóa rỗng) → false, không ném lỗi.
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  appSecret: string,
): boolean {
  if (!appSecret || !header?.startsWith(SIGNATURE_PREFIX)) return false;
  const received = header.slice(SIGNATURE_PREFIX.length);
  if (!HEX_SHA256.test(received)) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(received, 'hex'));
}

/** Postgres jsonb/text từ chối NUL và surrogate lẻ: làm sạch để một ký tự lạ không làm hỏng cả lô webhook. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const cleanText = (value: string): string =>
  value.replaceAll('\u0000', '').replace(LONE_SURROGATE, '\uFFFD');
const text = () => z.string().transform(cleanText);

/** Mốc thời gian hợp lệ (giây): tới năm 2100; ngoài khoảng → bản ghi bị bỏ (tránh `toISOString()` ném lỗi). */
const MAX_UNIX_SECONDS = 4_102_444_800;

const changeValueSchema = z.object({
  item: z.literal('comment'),
  verb: z.enum(['add', 'edited', 'remove']),
  comment_id: text().pipe(z.string().min(1)),
  post_id: text().pipe(z.string().min(1)),
  parent_id: text().pipe(z.string().min(1)).optional(),
  from: z.object({ id: text().pipe(z.string().min(1)), name: text().optional() }),
  message: text().optional(),
  photo: z.string().optional(),
  video: z.string().optional(),
  created_time: z.number().int().nonnegative().max(MAX_UNIX_SECONDS),
});

const bodySchema = z.object({
  object: z.literal('page'),
  entry: z.array(
    z.object({
      id: text().pipe(z.string().min(1)),
      /** Thời điểm sự kiện: FB `feed` dùng giây, Messenger dùng mili-giây → KHÔNG ràng buộc ở đây (xem `occurredAtOf`). */
      time: z.unknown().optional(),
      changes: z.array(z.object({ field: z.string(), value: z.unknown() })).default([]),
    }),
  ),
});

/**
 * `entry.time` → Date: số nguyên ≤ MAX_UNIX_SECONDS là giây; lớn hơn nhưng hợp lệ nếu là mili-giây (Messenger); còn lại
 * (không phải số/âm/ngoài khoảng) → `undefined` mà KHÔNG làm hỏng cả lô webhook.
 */
function occurredAtOf(time: unknown): Date | undefined {
  if (typeof time !== 'number' || !Number.isInteger(time) || time < 0) return undefined;
  if (time <= MAX_UNIX_SECONDS) return new Date(time * 1000);
  if (time <= MAX_UNIX_SECONDS * 1000) return new Date(time);
  return undefined;
}

/**
 * Chuẩn hóa thân webhook thành các sự kiện bình luận. Bỏ qua mọi thứ không phải bình luận (reaction, status, field
 * khác, verb khác như `hide`) và bản ghi thiếu trường bắt buộc. Cấu trúc sai → `[]`.
 */
export function parseMetaWebhook(body: unknown): NormalizedEvent[] {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return [];
  const events: NormalizedEvent[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'feed') continue;
      const value = changeValueSchema.safeParse(change.value);
      if (!value.success) continue;
      const v = value.data;
      const occurredAt = occurredAtOf(entry.time);
      const occurred = occurredAt ? { occurredAt } : {};
      if (v.verb === 'remove') {
        events.push({
          kind: 'comment_deleted',
          channelExternalId: entry.id,
          commentExternalId: v.comment_id,
          ...occurred,
        });
        continue;
      }
      events.push({
        kind: v.verb === 'add' ? 'comment_created' : 'comment_edited',
        channelExternalId: entry.id,
        ...(v.verb === 'edited' ? occurred : {}),
        comment: {
          externalId: v.comment_id,
          postExternalId: v.post_id,
          // Bình luận cấp 1 có parent_id = id bài; chỉ trả lời lồng mới có cha là bình luận.
          parentExternalId: v.parent_id && v.parent_id !== v.post_id ? v.parent_id : null,
          authorExternalId: v.from.id,
          ...(v.from.name === undefined ? {} : { authorName: v.from.name }),
          text: v.message ?? '',
          ...withAttachments(webhookAttachments(v)),
          createdAt: new Date(v.created_time * 1000),
          // Chống vòng lặp (docs/12 §1, nguyên tắc #5): do chính Page viết.
          isFromPage: v.from.id === entry.id,
        },
      });
    }
  }
  return events;
}

/**
 * Khóa chống trùng của một sự kiện (`webhook_events.event_hash`): băm các trường định danh, KHÔNG gồm nội dung
 * bình luận (không lộ tên/nội dung khách trong chỉ mục). Cùng (nền tảng, Page, loại, bình luận, thời gian) → cùng hash.
 */
export function eventHashOf(platform: Platform, event: NormalizedEvent): string {
  // Sửa/xóa dùng thời điểm SỰ KIỆN (entry.time) để mỗi lần sửa là một sự kiện riêng; thiếu thì rơi về cách cũ.
  const occurred = event.occurredAt ? String(event.occurredAt.getTime()) : null;
  const parts =
    event.kind === 'comment_deleted'
      ? [platform, event.channelExternalId, event.kind, event.commentExternalId, occurred ?? '']
      : [
          platform,
          event.channelExternalId,
          event.kind,
          event.comment.externalId,
          event.kind === 'comment_edited' && occurred
            ? occurred
            : String(event.comment.createdAt.getTime()),
          // Hai lần sửa cùng giây nhưng nội dung khác là hai sự kiện: chỉ băm (digest) nội dung vào khóa, không lưu thô.
          event.kind === 'comment_edited'
            ? createHash('sha256').update(event.comment.text).digest('hex')
            : '',
        ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

const storedAttachmentSchema = z.object({
  type: z.enum(ATTACHMENT_TYPES),
  url: z.string().optional(),
  externalId: z.string().optional(),
});

const storedCommentSchema = z.object({
  externalId: z.string().min(1),
  postExternalId: z.string().min(1),
  parentExternalId: z.string().min(1).nullable().optional(),
  authorExternalId: z.string().min(1),
  authorName: z.string().optional(),
  text: z.string(),
  attachments: z.array(storedAttachmentSchema).optional(),
  createdAt: z.iso.datetime(),
  isFromPage: z.boolean(),
});

const storedEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.enum(['comment_created', 'comment_edited']),
    channelExternalId: z.string().min(1),
    comment: storedCommentSchema,
    occurredAt: z.iso.datetime().optional(),
  }),
  z.object({
    kind: z.literal('comment_deleted'),
    channelExternalId: z.string().min(1),
    commentExternalId: z.string().min(1),
    occurredAt: z.iso.datetime().optional(),
  }),
]);

/** Dạng JSON thuần của sự kiện chuẩn hóa (lưu ở `webhook_events.payload`; chỉ trường cần dùng, không có phần thừa của Meta). */
export function serializeEvent(event: NormalizedEvent): Record<string, unknown> {
  const occurredAt = event.occurredAt ? { occurredAt: event.occurredAt.toISOString() } : {};
  if (event.kind === 'comment_deleted') return { ...event, ...occurredAt };
  return {
    ...event,
    ...occurredAt,
    comment: { ...event.comment, createdAt: event.comment.createdAt.toISOString() },
  };
}

/** Đọc lại sự kiện đã lưu; dữ liệu hỏng/lạ → `null` (worker đánh dấu lỗi, không ném nội dung). */
export function deserializeEvent(value: unknown): NormalizedEvent | null {
  const parsed = storedEventSchema.safeParse(value);
  if (!parsed.success) return null;
  const event = parsed.data;
  const occurred = event.occurredAt ? { occurredAt: new Date(event.occurredAt) } : {};
  if (event.kind === 'comment_deleted') {
    return {
      kind: 'comment_deleted',
      channelExternalId: event.channelExternalId,
      commentExternalId: event.commentExternalId,
      ...occurred,
    };
  }
  const { comment } = event;
  return {
    kind: event.kind,
    channelExternalId: event.channelExternalId,
    ...occurred,
    comment: {
      externalId: comment.externalId,
      postExternalId: comment.postExternalId,
      parentExternalId: comment.parentExternalId ?? null,
      authorExternalId: comment.authorExternalId,
      ...(comment.authorName === undefined ? {} : { authorName: comment.authorName }),
      text: comment.text,
      ...withAttachments(normalizeAttachments(comment.attachments ?? [])),
      createdAt: new Date(comment.createdAt),
      isFromPage: comment.isFromPage,
    },
  };
}

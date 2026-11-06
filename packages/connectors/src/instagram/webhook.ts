import { z } from 'zod';
import { cleanText } from '../facebook/webhook';
import type { NormalizedEvent } from '../types';

/**
 * Webhook Instagram (docs/12 §2): chuẩn hóa field `comments`. Chữ ký `X-Hub-Signature-256` là chữ ký Meta dùng chung
 * (`verifyMetaSignature`, cùng Meta App). Webhook `comments` KHÔNG có thời điểm tạo và KHÔNG báo sửa/xóa → thời điểm
 * lấy từ `entry.time` (giây); thiếu thì bỏ bản ghi (không bịa giờ). Không log, không đưa nội dung vào lỗi (nguyên tắc #6).
 */

const MAX_UNIX_SECONDS = 4_102_444_800;
const id = () => z.string().transform(cleanText).pipe(z.string().min(1));

const valueSchema = z.object({
  id: id(),
  text: z.string().transform(cleanText).optional(),
  parent_id: id().optional(),
  from: z.object({ id: id(), username: z.string().transform(cleanText).optional() }),
  media: z.object({ id: id() }),
});

const bodySchema = z.object({
  object: z.literal('instagram'),
  entry: z.array(
    z.object({
      id: id(),
      time: z.number().int().nonnegative().max(MAX_UNIX_SECONDS).optional(),
      changes: z.array(z.object({ field: z.string(), value: z.unknown() })).default([]),
    }),
  ),
});

export function parseInstagramWebhook(body: unknown): NormalizedEvent[] {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return [];
  const events: NormalizedEvent[] = [];
  for (const entry of parsed.data.entry) {
    if (entry.time === undefined) continue;
    for (const change of entry.changes) {
      if (change.field !== 'comments') continue;
      const value = valueSchema.safeParse(change.value);
      if (!value.success) continue;
      const v = value.data;
      events.push({
        kind: 'comment_created',
        channelExternalId: entry.id,
        comment: {
          externalId: v.id,
          postExternalId: v.media.id,
          parentExternalId: v.parent_id ?? null,
          authorExternalId: v.from.id,
          ...(v.from.username === undefined ? {} : { authorName: v.from.username }),
          text: v.text ?? '',
          createdAt: new Date(entry.time * 1000),
          // Chống vòng lặp (nguyên tắc #5): do chính tài khoản IG viết.
          isFromPage: v.from.id === entry.id,
        },
      });
    }
  }
  return events;
}

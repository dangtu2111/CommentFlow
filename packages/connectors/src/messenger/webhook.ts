import { z } from 'zod';
import { type CommentAttachment, normalizeAttachments } from '../attachments';
import { cleanText } from '../facebook/webhook';

/**
 * Webhook Messenger (FR-014, docs/12 §1): chuẩn hóa field `messages` + `message_echoes` của object `page`
 * (`entry[].messaging[]`). Chữ ký `X-Hub-Signature-256` là chữ ký Meta dùng chung (`verifyMetaSignature`, đã kiểm ở
 * route web trên thân thô trước khi tới đây). Thời điểm là MILI-GIÂY (`messaging[].timestamp`) — khác `feed` dùng giây;
 * thiếu/ngoài khoảng thì BỎ bản ghi (không bịa giờ: giờ này là mốc cửa sổ 24 giờ). Không log, không đưa nội dung vào lỗi
 * (nguyên tắc #6). Delivery/read/postback/reaction không có `message` → bỏ.
 */

const MAX_UNIX_MS = 4_102_444_800_000;
const id = () => z.string().transform(cleanText).pipe(z.string().min(1));

const attachmentSchema = z.object({
  type: z.string(),
  payload: z.object({ url: z.string().optional(), sticker_id: z.unknown().optional() }).optional(),
});

const messageSchema = z.object({
  mid: id(),
  text: z.string().transform(cleanText).optional(),
  is_echo: z.boolean().optional(),
  attachments: z.array(z.unknown()).optional(),
});

const messagingSchema = z.object({
  sender: z.object({ id: id() }),
  recipient: z.object({ id: id() }),
  timestamp: z.number().int().nonnegative().max(MAX_UNIX_MS),
  message: messageSchema,
});

const bodySchema = z.object({
  object: z.literal('page'),
  entry: z.array(z.object({ id: id(), messaging: z.array(z.unknown()).default([]) })),
});

export type NormalizedMessage = {
  externalId: string;
  text: string;
  attachments?: CommentAttachment[];
  createdAt: Date;
  /** Do chính Page gửi (echo) — chống vòng lặp (nguyên tắc #5): pipeline không coi là tin khách. */
  isFromPage: boolean;
};

export type NormalizedMessageEvent = {
  /** `in` = khách gửi tới Page; `out` = Page gửi đi (echo, kể cả tin do nhân viên gõ ở Meta Inbox). */
  direction: 'in' | 'out';
  /** Page ID. */
  channelExternalId: string;
  /** PSID của khách (page-scoped ID). */
  customerExternalId: string;
  message: NormalizedMessage;
};

/** `image` → photo (có `sticker_id` → sticker), `video` → video; loại khác (audio/file/location/template…) bỏ. */
function attachmentsOf(raw: readonly unknown[] | undefined): CommentAttachment[] {
  const items: CommentAttachment[] = [];
  for (const item of raw ?? []) {
    const parsed = attachmentSchema.safeParse(item);
    if (!parsed.success) continue;
    const { type, payload } = parsed.data;
    const kind =
      type === 'image' ? (payload?.sticker_id === undefined ? 'photo' : 'sticker') : type;
    if (kind !== 'photo' && kind !== 'sticker' && kind !== 'video') continue;
    items.push({ type: kind, ...(payload?.url === undefined ? {} : { url: payload.url }) });
  }
  return normalizeAttachments(items);
}

export function parseMessengerWebhook(body: unknown): NormalizedMessageEvent[] {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return [];
  const events: NormalizedMessageEvent[] = [];
  for (const entry of parsed.data.entry) {
    for (const raw of entry.messaging) {
      const item = messagingSchema.safeParse(raw);
      if (!item.success) continue;
      const { sender, recipient, timestamp, message } = item.data;
      const isEcho = message.is_echo === true;
      // Echo: Page → khách; thường: khách → Page. Bên Page phải khớp `entry.id`, nếu không thì bỏ (không đoán kênh).
      if ((isEcho ? sender.id : recipient.id) !== entry.id) continue;
      const attachments = attachmentsOf(message.attachments);
      const text = message.text ?? '';
      if (text === '' && attachments.length === 0) continue;
      events.push({
        direction: isEcho ? 'out' : 'in',
        channelExternalId: entry.id,
        customerExternalId: isEcho ? recipient.id : sender.id,
        message: {
          externalId: message.mid,
          text,
          ...(attachments.length > 0 ? { attachments } : {}),
          createdAt: new Date(timestamp),
          isFromPage: isEcho,
        },
      });
    }
  }
  return events;
}

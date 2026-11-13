import { z } from 'zod';
import { localDateTimeToUtc } from './zoned-time';

/**
 * Kiểm biểu mẫu Biên tập bài viết (POST-PUBLISHING). Mọi giá trị từ form chỉ là DỮ LIỆU: workspace/người dùng lấy từ phiên ở Server Action; DB kiểm lại kênh/giờ/quyền.
 * Giờ lên lịch nhập theo MÚI GIỜ CỬA HÀNG rồi đổi sang UTC. Ở đây chỉ kiểm hình dạng và cho mã lỗi thân thiện; ràng buộc cuối cùng nằm ở hàm DB (migration 0090).
 */
export const MAX_POST_CHARS = 63206;
export const MAX_PRODUCTS = 5;
export const MAX_MEDIA = 10;
export const MAX_AI_NOTE_CHARS = 1000;
const MIN_LEAD_MS = 2 * 60_000;
const MAX_LEAD_MS = 90 * 86_400_000;

export type PublishIntent = 'draft' | 'schedule' | 'publish';
export type PublishFormError = 'invalid' | 'empty_message' | 'no_channel' | 'invalid_schedule';
export type PublishFormValue = {
  intent: PublishIntent;
  id: string | undefined;
  message: string;
  channelIds: string[];
  productIds: string[];
  mediaIds: string[];
  aiNote: string | null;
  scheduledAt: Date | null;
};
export type PublishFormResult =
  | { ok: true; value: PublishFormValue }
  | { ok: false; code: PublishFormError };

type FormLike = { get(name: string): unknown; getAll(name: string): unknown[] };

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const schema = z.object({
  intent: z.enum(['draft', 'schedule', 'publish']),
  id: z.uuid().optional(),
  message: z.string().max(MAX_POST_CHARS),
  channelIds: z.array(z.uuid()).max(10),
  productIds: z.array(z.uuid()).max(MAX_PRODUCTS),
  mediaIds: z.array(z.uuid()).max(MAX_MEDIA),
  aiNote: z.string().max(MAX_AI_NOTE_CHARS),
});

export function parsePublishForm(
  form: FormLike,
  timeZone: string,
  now: Date = new Date(),
): PublishFormResult {
  const parsed = schema.safeParse({
    intent: text(form.get('intent')),
    id: text(form.get('id')) || undefined,
    // Chuẩn hóa xuống dòng của trình duyệt (CRLF) về LF để đếm ký tự và đăng thống nhất.
    message: text(form.get('message')).replace(/\r\n?/g, '\n'),
    channelIds: [...new Set(form.getAll('channel').map(text).filter(Boolean))],
    productIds: [...new Set(form.getAll('product').map(text).filter(Boolean))],
    mediaIds: [...new Set(form.getAll('media').map(text).filter(Boolean))],
    aiNote: text(form.get('aiNote')).replace(/\r\n?/g, '\n').trim(),
  });
  if (!parsed.success) return { ok: false, code: 'invalid' };
  const { intent, id, message, channelIds, productIds, mediaIds } = parsed.data;
  const aiNote = parsed.data.aiNote === '' ? null : parsed.data.aiNote;
  if (intent === 'draft')
    return {
      ok: true,
      value: { intent, id, message, channelIds, productIds, mediaIds, aiNote, scheduledAt: null },
    };
  if (message.trim() === '') return { ok: false, code: 'empty_message' };
  if (channelIds.length === 0) return { ok: false, code: 'no_channel' };
  if (intent === 'publish')
    return {
      ok: true,
      value: { intent, id, message, channelIds, productIds, mediaIds, aiNote, scheduledAt: null },
    };
  const at = localDateTimeToUtc(text(form.get('date')), text(form.get('time')), timeZone);
  const lead = at ? at.getTime() - now.getTime() : 0;
  if (!at || lead < MIN_LEAD_MS || lead > MAX_LEAD_MS)
    return { ok: false, code: 'invalid_schedule' };
  return {
    ok: true,
    value: { intent, id, message, channelIds, productIds, mediaIds, aiNote, scheduledAt: at },
  };
}

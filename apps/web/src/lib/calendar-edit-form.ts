import { z } from 'zod';
import { MAX_POST_CHARS } from './publish-form';
import { localDateTimeToUtc } from './zoned-time';

/**
 * Kiểm biểu mẫu "Sửa nhanh" trong hộp thoại bài của Lịch (CALENDAR-DND). Giá trị từ form chỉ là DỮ LIỆU: workspace/người dùng lấy từ phiên ở Server Action; DB kiểm lại
 * quyền, trạng thái bài và giờ. Giờ nhập theo MÚI GIỜ cửa hàng rồi đổi sang UTC. THUẦN.
 *  - `draft`: lưu nội dung, bài thành/ở lại bản nháp (không giờ).
 *  - `save` / `schedule`: lưu nội dung + giờ (bài ở lại/thành "đã lên lịch").
 */
export type CalendarEditIntent = 'draft' | 'save' | 'schedule';
export type CalendarEditError = 'invalid' | 'empty_message' | 'invalid_schedule';
export type CalendarEditValue = {
  id: string;
  intent: CalendarEditIntent;
  message: string;
  scheduledAt: Date | null;
};
export type CalendarEditResult =
  | { ok: true; value: CalendarEditValue }
  | { ok: false; code: CalendarEditError };

type FormLike = { get(name: string): unknown };
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const schema = z.object({
  id: z.uuid(),
  intent: z.enum(['draft', 'save', 'schedule']),
  message: z.string().max(MAX_POST_CHARS),
});

const MIN_LEAD_MS = 2 * 60_000;
const MAX_LEAD_MS = 90 * 86_400_000;

export function parseCalendarEdit(
  form: FormLike,
  timeZone: string,
  now: Date = new Date(),
): CalendarEditResult {
  const parsed = schema.safeParse({
    id: text(form.get('postId')),
    intent: text(form.get('intent')),
    message: text(form.get('message')).replace(/\r\n?/g, '\n'),
  });
  if (!parsed.success) return { ok: false, code: 'invalid' };
  const { id, intent, message } = parsed.data;
  if (intent === 'draft') return { ok: true, value: { id, intent, message, scheduledAt: null } };
  if (message.trim() === '') return { ok: false, code: 'empty_message' };
  const at = localDateTimeToUtc(text(form.get('date')), text(form.get('time')), timeZone);
  const lead = at ? at.getTime() - now.getTime() : 0;
  if (!at || lead < MIN_LEAD_MS || lead > MAX_LEAD_MS) {
    return { ok: false, code: 'invalid_schedule' };
  }
  return { ok: true, value: { id, intent, message, scheduledAt: at } };
}

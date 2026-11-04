/** Nội dung câu trả lời (FR-042). Thuần. Độ dài tính theo KÝ TỰ (emoji = 1) để khớp `char_length` của DB (1–8000). */
export const MAX_REPLY_LENGTH = 8000;

export type ParsedReply = { ok: true; text: string } | { ok: false; reason: 'empty' | 'too_long' };

export function parseReplyText(raw: unknown): ParsedReply {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  const text = raw.replace(/\r\n?/g, '\n').trim();
  const length = [...text].length;
  if (length < 1) return { ok: false, reason: 'empty' };
  if (length > MAX_REPLY_LENGTH) return { ok: false, reason: 'too_long' };
  return { ok: true, text };
}

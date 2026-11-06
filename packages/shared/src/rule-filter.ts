/**
 * Lọc quy tắc trước AI (docs/05 FR-024): bình luận CHỈ gồm emoji / sticker / tag (@tên) / dấu chấm câu → "Bỏ qua":
 * không phân loại, không soạn, KHÔNG trừ lượt (hạn mức). Hàm thuần, không DB, không LLM.
 *
 * Nguyên tắc: thận trọng — chỉ bỏ qua khi chắc chắn không có nội dung. Có chữ, chữ số, dấu "?", ký hiệu (+, $…),
 * ảnh/video đính kèm hoặc tệp lạ → KHÔNG bỏ qua (đẩy tiếp cho AI/người). Q-PRF1.
 */

export type RuleFilterReason = 'empty' | 'emoji' | 'sticker' | 'mention' | 'punctuation';

export type RuleFilterResult =
  | { skip: true; reason: RuleFilterReason }
  | { skip: false; reason: null };

export interface RuleFilterInput {
  text: string | null | undefined;
  /** Tệp đính kèm đã chuẩn hóa (`attachments[].type`). */
  attachments?: readonly { type: string }[];
  /** Vị trí tag theo Graph (`message_tags`): dữ liệu không tin cậy, giá trị sai bị bỏ qua. */
  mentions?: readonly { offset: number; length: number }[];
}

/** Chỉ xét tối đa chừng này tag theo `mentions` (chống đầu vào khổng lồ). */
const MAX_MENTIONS = 50;
const STICKER_TYPES: readonly string[] = ['sticker', 'gif'];

// Emoji gồm: hình (Extended_Pictographic), mặc định dạng emoji, cờ, ZWJ, chọn biến thể, khung phím, màu da, thẻ tag.
// KHÔNG gồm chữ số/#/* (để "1️⃣" còn lại chữ số → không bỏ qua).
const EMOJI =
  /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|‍|︎|️|⃣|[\u{1F3FB}-\u{1F3FF}]|[\u{E0020}-\u{E007F}]/gu;
// Dấu câu (\p{P}) trừ dấu hỏi — "?" một mình có thể là câu hỏi thật → để người xem.
const PUNCTUATION = /(?![?¿？⁇⁈⁉‽])\p{P}/gu;
const BLANK = /[\s\p{Cf}]/gu;
// Tag dạng cũ `@[id:0:Tên]` và `@tên` đứng đầu từ (không phải email a@b.com).
const MENTION_MARKUP = /@\[\d+:\d+:[^\]]*\]/g;
const MENTION_TOKEN = /(?<!\S)@\S+/gu;

interface Stripped {
  text: string;
  changed: boolean;
}

function stripByPattern(text: string, pattern: RegExp, replacement: string): Stripped {
  const next = text.replace(pattern, replacement);
  return { text: next, changed: next.length !== text.length };
}

/** Cắt các đoạn tag theo offset/length hợp lệ, không chồng nhau. */
function stripMentionRanges(text: string, mentions: RuleFilterInput['mentions']): Stripped {
  const ranges = (mentions ?? [])
    .slice(0, MAX_MENTIONS)
    .filter(
      (m) =>
        Number.isInteger(m.offset) &&
        Number.isInteger(m.length) &&
        m.offset >= 0 &&
        m.length >= 1 &&
        m.offset + m.length <= text.length,
    )
    .sort((a, b) => a.offset - b.offset);
  let out = '';
  let cursor = 0;
  let changed = false;
  for (const { offset, length } of ranges) {
    if (offset < cursor) continue; // chồng nhau: bỏ
    out += `${text.slice(cursor, offset)} `;
    cursor = offset + length;
    changed = true;
  }
  return { text: out + text.slice(cursor), changed };
}

export function ruleFilter(input: RuleFilterInput): RuleFilterResult {
  const attachments = input.attachments ?? [];
  if (attachments.some((a) => !STICKER_TYPES.includes(a.type)))
    return { skip: false, reason: null };
  const hasSticker = attachments.length > 0;

  const ranges = stripMentionRanges(input.text ?? '', input.mentions);
  const markup = stripByPattern(ranges.text, MENTION_MARKUP, ' ');
  const token = stripByPattern(markup.text, MENTION_TOKEN, ' ');
  const mention = ranges.changed || markup.changed || token.changed;

  const noEmoji = stripByPattern(token.text, EMOJI, '');
  const noPunctuation = stripByPattern(noEmoji.text, PUNCTUATION, '');
  if (noPunctuation.text.replace(BLANK, '') !== '') return { skip: false, reason: null };

  if (hasSticker) return { skip: true, reason: 'sticker' };
  if (mention) return { skip: true, reason: 'mention' };
  if (noEmoji.changed) return { skip: true, reason: 'emoji' };
  if (noPunctuation.changed) return { skip: true, reason: 'punctuation' };
  return { skip: true, reason: 'empty' };
}

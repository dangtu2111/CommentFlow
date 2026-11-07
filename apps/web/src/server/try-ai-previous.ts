import { type MaskedText, maskPii } from '@flow/shared';
import { MAX_PREVIOUS_RAW_CHARS } from '../lib/try-ai-limits';

/**
 * Ô "lượt trước" (tùy chọn) của Thử AI (PIPE-CONVO-CONTEXT, Q-POR12 điểm 5): Owner dán các lượt đã có trong hội thoại để thử cách AI
 * hiểu câu trả lời ngắn ("M đen"). Mỗi dòng một lượt; tiền tố `Khách:`/`Shop:` (hoặc `Customer:`) chọn người nói, thiếu tiền tố = khách.
 * Tối đa 5 lượt cuối, mỗi lượt ≤ 500 ký tự, ĐÃ che PII (nguyên tắc #6). Hàm thuần.
 */
export const MAX_PREVIOUS_TURNS = 5;
export const MAX_PREVIOUS_TURN_CHARS = 500;

export type PreviousTurn = { from: 'customer' | 'shop'; text: MaskedText; at: Date };

const PREFIX = /^\s*(kh[aá]ch|customer|shop)\s*:\s*/i;

export function parsePreviousTurns(raw: unknown): PreviousTurn[] {
  if (typeof raw !== 'string') return [];
  const lines = raw
    .slice(0, MAX_PREVIOUS_RAW_CHARS)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const turns = lines.flatMap((line) => {
    const match = PREFIX.exec(line);
    const from: 'customer' | 'shop' = match?.[1]?.toLowerCase() === 'shop' ? 'shop' : 'customer';
    const text = (match ? line.slice(match[0].length) : line)
      .trim()
      .slice(0, MAX_PREVIOUS_TURN_CHARS);
    return text === '' ? [] : [{ from, text: maskPii(text) }];
  });
  // Mốc thời gian tăng dần theo thứ tự dòng (cũ → mới) để lõi sắp xếp ổn định.
  return turns
    .slice(-MAX_PREVIOUS_TURNS)
    .map((turn, index) => ({ ...turn, at: new Date(Date.UTC(2000, 0, 1, 0, index)) }));
}

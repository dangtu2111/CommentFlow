import { checkConceptSupport } from '../guard-support';
import type { FactPlan } from './types';

/**
 * Chỗ giữ chỗ `{fact:id}` và guard TỪ CHỐI CỨNG (ADR 017): ngoài chỗ giữ chỗ, câu do LLM viết KHÔNG được có chữ số, số viết bằng chữ cạnh đơn vị tiền/thời gian/phần trăm, ký hiệu tiền
 * tệ, hay khẳng định có/không về khái niệm chính sách (COD, đổi trả, bảo hành, trả góp…). Vi phạm → bỏ câu (không gọi LLM sửa). Kết quả không chứa nội dung khách.
 */
export const SLOT = /\{fact:([a-z_]+(?:\.\d+)?)\}/g;

export function slotIds(text: string): string[] {
  return [...text.matchAll(SLOT)].map((match) => match[1] as string);
}

export type SlotViolationCode =
  | 'unknown_slot'
  | 'unknown_fact_used'
  | 'digit'
  | 'number_word'
  | 'currency_symbol'
  | 'concept';
export type SlotCheck = { ok: boolean; violations: Array<{ code: SlotViolationCode }> };

// Số viết bằng chữ. Từ mơ hồ khi bỏ dấu (ba/năm/sáu/tư/nam/sau) CHỈ nhận dạng có dấu, để không chặn nhầm "sau ngày", "từ".
const NUMBER_WORDS = [
  'một',
  'mốt',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
  'mười',
  'mươi',
  'lăm',
  'trăm',
  'nghìn',
  'ngàn',
  'triệu',
  'tỷ',
  'rưỡi',
  'mot',
  'bon',
  'bay',
  'tam',
  'chin',
  'muoi',
  'tram',
  'nghin',
  'ngan',
  'trieu',
  'ruoi',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
  'thousand',
  'million',
  'dozen',
];
const UNITS = [
  'ngày',
  'ngay',
  'tháng',
  'thang',
  'tuần',
  'tuan',
  'giờ',
  'gio',
  'đồng',
  'dong',
  'k',
  'nghìn',
  'ngàn',
  'triệu',
  'tiền',
  'phần trăm',
  'phan tram',
  'cái',
  'chiếc',
  'đôi',
  'kg',
  'đô la',
  'usd',
  'vnd',
  'days?',
  'weeks?',
  'months?',
  'hours?',
  'dollars?',
  'percent',
  'items?',
  'pieces?',
  'pcs',
];
const LETTER_BEFORE = '(?<![\\p{L}\\p{N}])';
const LETTER_AFTER = '(?![\\p{L}\\p{N}])';
const NUMBER_WORD_UNIT = new RegExp(
  `${LETTER_BEFORE}(?:${NUMBER_WORDS.join('|')})(?:[\\s-]+(?:${NUMBER_WORDS.join('|')}))*[\\s-]+(?:${UNITS.join('|')})${LETTER_AFTER}`,
  'iu',
);
const CURRENCY_SYMBOL = /[$€£¥₫]|(?<![\p{L}\p{N}])đ(?![\p{L}\p{N}])/u;

export function checkSlotText(text: string, plan: FactPlan): SlotCheck {
  const codes = new Set<SlotViolationCode>();
  const byId = new Map(plan.facts.map((fact) => [fact.id, fact]));
  for (const id of slotIds(text)) {
    const fact = byId.get(id);
    if (fact === undefined) codes.add('unknown_slot');
    else if (fact.status === 'unknown') codes.add('unknown_fact_used');
  }
  const outside = text.replace(SLOT, ' ◇ ');
  if (/\d/.test(outside)) codes.add('digit');
  if (NUMBER_WORD_UNIT.test(outside)) codes.add('number_word');
  if (CURRENCY_SYMBOL.test(outside)) codes.add('currency_symbol');
  if (!checkConceptSupport({ reply: outside, sources: [] }).ok) codes.add('concept');
  const violations = [...codes].map((code) => ({ code }));
  return { ok: violations.length === 0, violations };
}

/** Hai câu dùng CÙNG tập mã sự kiện (so theo tập, bỏ qua thứ tự/số lần lặp). */
export function sameSlotSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

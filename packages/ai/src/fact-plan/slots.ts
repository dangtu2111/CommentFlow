import { type ConceptId, checkConceptSupport } from '../guard-support';
import type { FactKind, FactPlan } from './types';

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
  | 'concept'
  | 'invitation'
  | 'stock_claim';
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
// Cho phép tối đa 2 từ chữ chen giữa số viết bằng chữ và đơn vị: "one business day", "two working weeks", "ba ngày làm việc", "một tới hai tuần".
// Đã biết: "one of our days" cũng bị bắt (số-chữ + 2 từ + đơn vị) — chấp nhận, câu LLM viết ngoài chỗ giữ chỗ không cần cấu trúc đó.
const NUMBER_WORD_UNIT = new RegExp(
  `${LETTER_BEFORE}(?:${NUMBER_WORDS.join('|')})(?:[\\s-]+(?:${NUMBER_WORDS.join('|')}))*(?:[\\s-]+\\p{L}+){0,2}[\\s-]+(?:${UNITS.join('|')})${LETTER_AFTER}`,
  'iu',
);
const CURRENCY_SYMBOL = /[$€£¥₫]|(?<![\p{L}\p{N}])đ(?![\p{L}\p{N}])/u;

/** Khái niệm chính sách nào được PHÉP nêu tên trong câu nếu câu có chỗ giữ chỗ thuộc loại tương ứng ("Về đổi trả, {fact:returns}"); khẳng định do chỗ giữ chỗ mang. */
const CONCEPT_SLOT_KINDS: Record<ConceptId, readonly FactKind[]> = {
  cod: ['cod', 'payment'],
  installment: ['payment'],
  invoice: ['payment'],
  international_shipping: ['ship_destination'],
  return: ['returns', 'return_shipping', 'return_eligibility', 'refund_to'],
  refund: ['returns', 'refund_to', 'return_shipping'],
  warranty: ['warranty'],
};
/** Câu mời nhắn tin/inbox/liên hệ: CHỈ code được viết (ADR 017 điểm 5) — bản LLM có câu mời bị từ chối cứng. */
const INVITATION =
  /(?<![\p{L}\p{N}])(?:inbox|ib|nhắn tin|nhắn shop|liên hệ (?:với )?(?:shop|cửa hàng|chúng tôi)|gửi tin nhắn|(?:please )?message (?:us|the shop|our shop|shop)|contact (?:us|the shop|our shop|shop)|dm us|reach out to (?:us|the shop|our shop|shop))(?![\p{L}\p{N}])/iu;
/**
 * Tình trạng hàng LLM tự viết ngoài chỗ giữ chỗ tồn kho: "còn hàng/hết hàng/còn sẵn", "in stock/out of stock/sold out", và "available" CHỈ khi là vị ngữ khẳng định ("is available",
 * "still available") hoặc đứng một mình — không bắt "available in black", "available shipping methods", "available options".
 */
const STOCK_CLAIM = new RegExp(
  [
    String.raw`(?<![\p{L}\p{N}])(?:còn hàng|hết hàng|còn sẵn|sắp hết|in stock|out of stock|sold out)(?![\p{L}\p{N}])`,
    String.raw`(?<![\p{L}\p{N}])(?:is|are|it's|now|currently|still)\s+available(?![\p{L}\p{N}])(?!\s+(?:in|for|at|on|as|to|with)(?![\p{L}\p{N}]))(?!\s+(?:options?|colou?rs?|sizes?|shipping|methods?))`,
    String.raw`(?:^|[.!?]\s*)available\s*[.!]?\s*$`,
  ].join('|'),
  'iu',
);
const SENTENCE_BREAK = /(?<=[.!?…])\s+|\n+/;

/** Có khẳng định/nêu khái niệm chính sách ngoài chỗ giữ chỗ cùng loại không (xét từng câu). */
function hasUnslottedConcept(text: string, kindOf: ReadonlyMap<string, FactKind>): boolean {
  for (const sentence of text.split(SENTENCE_BREAK)) {
    const slotKinds = slotIds(sentence).flatMap((id) => kindOf.get(id) ?? []);
    const result = checkConceptSupport({ reply: sentence.replace(SLOT, ' ◇ '), sources: [] });
    const flagged = result.violations.some(
      (violation) =>
        !CONCEPT_SLOT_KINDS[violation.concept].some((kind) => slotKinds.includes(kind)),
    );
    if (flagged) return true;
  }
  return false;
}

export function checkSlotText(text: string, plan: FactPlan): SlotCheck {
  const codes = new Set<SlotViolationCode>();
  const byId = new Map(plan.facts.map((fact) => [fact.id, fact]));
  for (const id of slotIds(text)) {
    const fact = byId.get(id);
    if (fact === undefined) codes.add('unknown_slot');
    else if (fact.status === 'unknown') codes.add('unknown_fact_used');
  }
  const outside = text.replace(SLOT, ' ◇ ');
  if (INVITATION.test(outside)) codes.add('invitation');
  if (STOCK_CLAIM.test(outside)) codes.add('stock_claim');
  if (/\d/.test(outside)) codes.add('digit');
  if (NUMBER_WORD_UNIT.test(outside)) codes.add('number_word');
  if (CURRENCY_SYMBOL.test(outside)) codes.add('currency_symbol');
  const kindOf = new Map(plan.facts.map((fact) => [fact.id, fact.kind] as const));
  if (hasUnslottedConcept(text, kindOf)) codes.add('concept');
  const violations = [...codes].map((code) => ({ code }));
  return { ok: violations.length === 0, violations };
}

/** Hai câu dùng CÙNG tập mã sự kiện (so theo tập, bỏ qua thứ tự/số lần lặp). */
export function sameSlotSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

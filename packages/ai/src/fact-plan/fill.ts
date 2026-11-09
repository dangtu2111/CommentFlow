import { currencyExponent } from '@flow/shared';
import { countryName } from './destinations';
import { SLOT, slotIds } from './slots';
import type { Fact, FactPlan, FactValue } from './types';

type Lang = 'vi' | 'en';
type Money = { amountMinor: number; currency: string };

/**
 * Điền giá trị vào chỗ giữ chỗ (ADR 017): định dạng tiền theo TIỀN TỆ CỦA SẢN PHẨM (VND/USD…); ngôn ngữ chỉ quyết định dấu phân cách. `claims` và nguồn do CODE sinh từ chỗ giữ chỗ
 * (không để model tự khai `source_ids`), nên không còn lệch giữa ý và nguồn.
 */
const SEPARATORS: Record<Lang, { thousand: string; decimal: string }> = {
  vi: { thousand: '.', decimal: ',' },
  en: { thousand: ',', decimal: '.' },
};
const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

const group = (digits: string, thousand: string): string =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, thousand);

/** Tiền theo tiền tệ + ngôn ngữ; đầu vào hỏng → `null` (không bịa số). */
export function formatMoney(money: Money, lang: Lang): string | null {
  const { amountMinor, currency } = money;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return null;
  const { thousand, decimal } = SEPARATORS[lang];
  if (currency === 'VND') return `${group(String(amountMinor), thousand)}đ`;
  const exponent = currencyExponent(currency);
  if (exponent === null) return null;
  const digits = String(amountMinor).padStart(exponent + 1, '0');
  const whole = group(digits.slice(0, digits.length - exponent), thousand);
  const fraction = digits.slice(digits.length - exponent);
  const number = exponent === 0 ? whole : `${whole}${decimal}${fraction}`;
  const symbol = SYMBOLS[currency];
  return symbol === undefined ? `${number} ${currency}` : `${symbol}${number}`;
}

const METHODS: Record<string, Record<Lang, string>> = {
  cod: { vi: 'thanh toán khi nhận hàng (COD)', en: 'cash on delivery (COD)' },
  bank_transfer: { vi: 'chuyển khoản', en: 'bank transfer' },
  card: { vi: 'thẻ', en: 'card' },
  installment: { vi: 'trả góp', en: 'installments' },
  cash: { vi: 'tiền mặt', en: 'cash' },
};

function days(min: number, max: number, lang: Lang): string {
  const span = min === max ? String(min) : `${min}–${max}`;
  if (lang === 'vi') return `${span} ngày`;
  return `${span} ${max === 1 ? 'day' : 'days'}`;
}

function renderValue(fact: Extract<Fact, { status: 'known' }>, lang: Lang): string | null {
  const value: FactValue = fact.value;
  switch (value.type) {
    case 'text':
      return value.text;
    case 'money':
      if (fact.kind === 'ship_fee' && value.amountMinor === 0) {
        return lang === 'vi' ? 'miễn phí' : 'free';
      }
      return formatMoney(value, lang);
    case 'money_range': {
      const low = formatMoney({ amountMinor: value.minMinor, currency: value.currency }, lang);
      const high = formatMoney({ amountMinor: value.maxMinor, currency: value.currency }, lang);
      return low === null || high === null ? null : `${low} – ${high}`;
    }
    case 'days':
      return days(value.min, value.max, lang);
    case 'bool':
      return value.value
        ? lang === 'vi'
          ? 'có hỗ trợ thanh toán khi nhận hàng (COD)'
          : 'support cash on delivery (COD)'
        : lang === 'vi'
          ? 'chưa hỗ trợ thanh toán khi nhận hàng (COD)'
          : 'does not support cash on delivery (COD)';
    case 'stock':
      if (value.display === 'in') return lang === 'vi' ? 'còn hàng' : 'in stock';
      if (value.display === 'out') return lang === 'vi' ? 'hết hàng' : 'out of stock';
      if (value.display === 'low') return lang === 'vi' ? 'sắp hết hàng' : 'almost sold out';
      return lang === 'vi' ? `còn ${value.n} sản phẩm` : `${value.n} in stock`;
    case 'none':
      if (fact.kind === 'returns') {
        return lang === 'vi' ? 'không áp dụng đổi trả' : 'returns are not accepted';
      }
      return lang === 'vi' ? 'không bảo hành' : 'no warranty';
    case 'days_count': {
      const base =
        lang === 'vi'
          ? `đổi trả trong ${value.n} ngày`
          : `returns accepted within ${value.n} ${value.n === 1 ? 'day' : 'days'}`;
      const conditions = value.conditions ?? [];
      if (conditions.length === 0) return base;
      return `${base} (${lang === 'vi' ? 'điều kiện' : 'conditions'}: ${conditions.join('; ')})`;
    }
    case 'months_count': {
      if (value.scope) {
        return lang === 'vi'
          ? `bảo hành ${value.scope} ${value.n} tháng`
          : `${value.n}-month warranty (${value.scope})`;
      }
      return lang === 'vi' ? `bảo hành ${value.n} tháng` : `${value.n}-month warranty`;
    }
    case 'methods':
      return value.methods.map((method) => METHODS[method]?.[lang] ?? method).join(', ');
    case 'fee_mode': {
      if (value.mode === 'free') return lang === 'vi' ? 'miễn phí' : 'free';
      if (value.mode === 'at_checkout') {
        return lang === 'vi'
          ? 'được tính khi thanh toán, tùy địa chỉ nhận và hình thức giao'
          : 'calculated at checkout based on your destination and shipping method';
      }
      const over = formatMoney(
        { amountMinor: value.overMinor ?? -1, currency: value.currency ?? 'VND' },
        lang,
      );
      if (over === null) return null;
      return lang === 'vi' ? `miễn phí cho đơn từ ${over}` : `free on orders over ${over}`;
    }
    case 'days_mode':
      return lang === 'vi' ? 'hiển thị khi thanh toán' : 'shown at checkout';
    case 'destination': {
      if (value.ok && value.nationwide && value.place === 'VN') {
        return lang === 'vi' ? 'shop giao toàn quốc' : 'we ship nationwide';
      }
      if (value.ok) {
        return lang === 'vi'
          ? `shop có giao tới ${countryName(value.place, 'vi')}`
          : `we ship to ${countryName(value.place, 'en')}`;
      }
      const list = value.shipsTo.map((code) => countryName(code, lang)).join(', ');
      return lang === 'vi' ? `hiện shop giao tới ${list}` : `we currently ship to ${list}`;
    }
    case 'refund_to':
      return lang === 'vi'
        ? 'hoàn tiền về phương thức thanh toán ban đầu'
        : 'refunds go back to the original payment method';
    case 'return_shipping':
      if (value.payer === 'shop') {
        return lang === 'vi' ? 'shop chịu phí ship khi trả hàng' : 'we cover return shipping';
      }
      return lang === 'vi'
        ? 'nếu đổi ý, khách chịu phí ship khi trả hàng'
        : 'for change-of-mind returns, the customer pays return shipping';
    case 'return_eligibility':
      return lang === 'vi'
        ? 'khả năng đổi trả tùy từng sản phẩm'
        : 'whether an item can be returned depends on the item';
  }
}

export type Claim = {
  text: string;
  source_ids: string[];
  kind: 'fact' | 'greeting' | 'question_back';
};
export type FillResult = {
  text: string;
  /** Mã chỗ giữ chỗ không điền được (không có trong plan, `unknown`, hoặc giá trị hỏng) — nơi gọi PHẢI từ chối câu. */
  missing: string[];
  claims: Claim[];
  /** Nguồn kiến thức đã dùng (không gồm số khách tự nêu). */
  sourceIds: string[];
  /** Các giá trị đã điền (để kiểm số tiền với CHÍNH giá trị code vừa điền). */
  rendered: string[];
};

const SENTENCE_BREAK = /(?<=[.!?…])\s+|\n+/;

const LEAD_IN_BEFORE_SENTENCE_SLOT =
  /(?:^|(?<=[.!?…]\s))[^.!?…{}]*?(?<![\p{L}\p{N}])(?:là|is|are)\s+(\{fact:(?:ship_destination|refund_to|return_shipping|return_eligibility)\})/giu;
const ENDS_WITH_SENTENCE_SLOT =
  /\{fact:(?:ship_destination|refund_to|return_shipping|return_eligibility)\}\s*$/u;
const SENTENCE_SLOT_KINDS: ReadonlySet<string> = new Set([
  'ship_destination',
  'refund_to',
  'return_shipping',
  'return_eligibility',
]);
const DUPLICATE_CON = /(?<![\p{L}\p{N}])(còn)\s+còn(?![\p{L}\p{N}])/giu;

export function fillSlots(template: string, plan: FactPlan, options: { lang: Lang }): FillResult {
  const byId = new Map(plan.facts.map((fact) => [fact.id, fact]));
  const missing: string[] = [];
  const rendered: string[] = [];
  const render = (id: string): string | null => {
    const fact = byId.get(id);
    const out = fact?.status === 'known' ? renderValue(fact, options.lang) : null;
    if (out === null && !missing.includes(id)) missing.push(id);
    if (out !== null && !rendered.includes(out)) rendered.push(out);
    return out;
  };
  // Lời dẫn của bộ soạn + cụm điền có thể lặp từ ("hiện còn" + "còn 5 sản phẩm"): gộp "còn còn" → "còn" (chỉ chữ, không đụng giá trị đã điền).
  const dedupe = (text: string) => text.replace(DUPLICATE_CON, '$1');
  // Viết hoa chữ đầu của giá trị khi nó mở đầu một câu mới (đứng sau ". ", "! ", "? "): "…$439.99. We ship to …".
  const AFTER_TERMINATOR = /[.!?…]\s+$/;
  // Giá trị là CÂU hoàn chỉnh (khu vực giao, hoàn tiền về đâu, ai trả phí ship khi trả hàng, điều kiện đổi trả) mà bộ soạn nối sau "là/is/are" ("Phí ship toàn quốc là {fact:…}")
  // → bỏ cụm dẫn đó, câu sự kiện đứng riêng (viết hoa chữ đầu).
  const CAPITALIZE = String.fromCharCode(0x200b);
  const dropLeadIn = (text: string) =>
    text.replace(LEAD_IN_BEFORE_SENTENCE_SLOT, (_all, slot: string) => `${CAPITALIZE}${slot}`);
  const fillText = (raw: string) => {
    const text = dropLeadIn(raw);
    // Hai câu sự kiện hoàn chỉnh đứng liền nhau không dấu ("{fact:a} {fact:b}") → thêm dấu chấm sau câu trước, câu sau viết hoa.
    let previousSentenceSlotEnd = -1;
    const filled = dedupe(
      text
        .replace(SLOT, (whole, id: string, offset: number) => {
          const value = render(id);
          if (value === null) return whole;
          const followsSentenceSlot =
            previousSentenceSlotEnd >= 0 &&
            /^\s+$/.test(text.slice(previousSentenceSlotEnd, offset));
          const sentenceStart =
            offset === 0 ||
            followsSentenceSlot ||
            AFTER_TERMINATOR.test(text.slice(0, offset)) ||
            text[offset - 1] === CAPITALIZE;
          const isSentenceSlot = SENTENCE_SLOT_KINDS.has(byId.get(id)?.kind ?? '');
          previousSentenceSlotEnd = isSentenceSlot ? offset + whole.length : -1;
          const shown = sentenceStart
            ? value.charAt(0).toLocaleUpperCase() + value.slice(1)
            : value;
          const nextIsSlot = /^\s+\{fact:/.test(text.slice(offset + whole.length));
          return isSentenceSlot && nextIsSlot && !/[.!?…]$/.test(shown) ? `${shown}.` : shown;
        })
        .split(CAPITALIZE)
        .join(''),
    );
    // Câu kết thúc bằng một sự kiện là CÂU hoàn chỉnh mà thiếu dấu kết câu → thêm dấu chấm.
    return ENDS_WITH_SENTENCE_SLOT.test(text) && !/[.!?…]$/.test(filled) ? `${filled}.` : filled;
  };

  const claims: Claim[] = [];
  const sourceIds: string[] = [];
  for (const sentence of template.split(SENTENCE_BREAK).filter((s) => s.trim() !== '')) {
    const sources = new Set<string>();
    for (const id of slotIds(sentence)) {
      const fact = byId.get(id);
      if (fact?.status === 'known' && fact.sourceId !== 'customer') sources.add(fact.sourceId);
    }
    const text = fillText(sentence.trim());
    const kind = sources.size > 0 ? 'fact' : text.endsWith('?') ? 'question_back' : 'greeting';
    claims.push({ text, source_ids: [...sources], kind });
    for (const id of sources) if (!sourceIds.includes(id)) sourceIds.push(id);
  }
  return { text: fillText(template), missing, claims, sourceIds, rendered };
}

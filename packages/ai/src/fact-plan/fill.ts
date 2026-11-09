import { currencyExponent } from '@flow/shared';
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
  const fillText = (text: string) => text.replace(SLOT, (whole, id: string) => render(id) ?? whole);

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

import { maskPii } from '@flow/shared';
import { extractClaims } from '../guard-money';

/**
 * Mẫu câu của shop (FR-132): biến câu nhân viên đã gửi thành "mẫu giọng văn" AN TOÀN để đưa vào prompt.
 * Hàm THUẦN, không DB/LLM. Nguyên tắc: không chắc là không lấy — mẫu còn liên hệ/ngày/phần trăm
 * hoặc số tiền/tồn kho không khớp biến thể nào bị TỪ CHỐI (nguyên tắc #4, #6).
 */

/** Biến thể sản phẩm hiện tại (đọc từ `product_variants`, không từ cache/vector). */
export interface ExampleVariant {
  readonly id: string;
  readonly priceVnd: number;
  /** `null` = không theo dõi tồn kho. */
  readonly stock: number | null;
}

export const EXAMPLE_REJECT = {
  EMPTY: 'EXAMPLE_EMPTY',
  CONTACT: 'EXAMPLE_CONTACT_REMAINS',
  VOLATILE: 'EXAMPLE_VOLATILE_FACT',
  MONEY: 'EXAMPLE_UNKNOWN_MONEY',
  STOCK: 'EXAMPLE_UNKNOWN_STOCK',
} as const;
export type ExampleRejectCode = (typeof EXAMPLE_REJECT)[keyof typeof EXAMPLE_REJECT];

export type BuildTemplateResult =
  | { readonly ok: true; readonly template: string; readonly variantIds: readonly string[] }
  | { readonly ok: false; readonly code: ExampleRejectCode };

const reject = (
  code: ExampleRejectCode,
): { readonly ok: false; readonly code: ExampleRejectCode } => ({
  ok: false,
  code,
});

const ZERO_WIDTH = /[­​-‍⁠-⁤﻿]/g;
// Số KHÔNG được theo sau bởi đơn vị tiền ("còn 1 triệu" là giá, không phải tồn kho).
const MONEY_UNIT_AFTER = String.raw`(?!\s*(?:k|nghìn|ngàn|tr|triệu|tỷ|tỉ|đ|₫|vnd|đồng)(?![\p{L}]))`;
// "còn 7", "còn lại có 7", "chỉ còn 7" / "7 left", "7 in stock". Chỉ phần chữ số bị thay.
const STOCK_VI = new RegExp(
  String.raw`(?<=\b(?:còn|con)(?:\s+(?:lại|có))*\s+)\d{1,6}(?![\d.,])${MONEY_UNIT_AFTER}`,
  'giu',
);
const STOCK_EN = /(?<![\d.,])\d{1,6}(?=\s+(?:left|in stock|pcs left|items left|available)\b)/giu;
// Chữ số ngoài ASCII lách được regex SĐT; từ lóng chỉ tiền không nhận ra được → từ chối.
const NON_ASCII_DIGIT = /(?![0-9])\p{Nd}/u;
const SLANG_MONEY = /(?:\d\s*m\s*\d|(?<![\p{L}])(?:trăm|củ|lít|xị)(?![\p{L}]))/iu;
const RESERVED = /\{(?:price|stock):|\p{Co}/u;
const PLACEHOLDER = /\{(price|stock):([^}]+)\}/g;
const SENTINEL_BASE = 0xe100; // vùng ký tự riêng: không khớp regex dữ kiện nào
const CONTACT_KINDS = new Set(['phone', 'email', 'link']);

function sentinel(slot: number): string {
  return String.fromCharCode(SENTINEL_BASE + slot);
}

/** Thay tồn kho khớp biến thể bằng ký tự giữ chỗ; trả `null` nếu có số tồn lạ. */
function swapStock(
  text: string,
  variants: readonly ExampleVariant[],
): { text: string; ids: string[] } | null {
  const ids: string[] = [];
  let unknown = false;
  const swap = (digits: string): string => {
    const stock = Number(digits);
    const hit = variants.find((v) => v.stock === stock);
    if (hit === undefined) {
      unknown = true;
      return digits;
    }
    ids.push(hit.id);
    return sentinel(ids.length - 1);
  };
  const out = text.replace(STOCK_VI, swap).replace(STOCK_EN, swap);
  return unknown ? null : { text: out, ids };
}

export type SanitizeResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: ExampleRejectCode };

/**
 * Làm sạch văn bản khách/nhân viên: NFKC, bỏ ký tự vô hình, che SĐT/email; từ chối nếu còn liên hệ
 * (tổng đài, link, chữ số lạ) hoặc ký tự dành riêng. Dùng cho CẢ câu hỏi lẫn câu trả lời.
 */
export function sanitizeExampleText(text: string): SanitizeResult {
  const normalized = text.normalize('NFKC').replace(ZERO_WIDTH, '');
  if (RESERVED.test(normalized)) return reject(EXAMPLE_REJECT.VOLATILE);
  const masked = maskPii(normalized).trim();
  if (NON_ASCII_DIGIT.test(masked)) return reject(EXAMPLE_REJECT.CONTACT);
  if (extractClaims(masked).some((c) => CONTACT_KINDS.has(c.kind))) {
    return reject(EXAMPLE_REJECT.CONTACT);
  }
  return { ok: true, text: masked };
}

/**
 * Che PII + thay giá/tồn bằng `{price:<id>}`/`{stock:<id>}`. `variants` là các biến thể của sản phẩm
 * mà câu nói đến; giá/tồn trong câu phải khớp đúng một trong số đó.
 */
export function buildExampleTemplate(
  text: string,
  variants: readonly ExampleVariant[],
): BuildTemplateResult {
  const clean = sanitizeExampleText(text);
  if (!clean.ok) return clean;
  const masked = clean.text;
  if (masked === '') return reject(EXAMPLE_REJECT.EMPTY);
  if (SLANG_MONEY.test(masked)) return reject(EXAMPLE_REJECT.MONEY);

  const stock = swapStock(masked, variants);
  if (stock === null) return reject(EXAMPLE_REJECT.STOCK);

  const claims = extractClaims(stock.text);
  if (claims.some((c) => CONTACT_KINDS.has(c.kind))) return reject(EXAMPLE_REJECT.CONTACT);
  if (claims.some((c) => c.kind !== 'money')) return reject(EXAMPLE_REJECT.VOLATILE);

  const money = claims.filter((c) => c.kind === 'money');
  const indexes = new Set(money.map((c) => c.index));
  if (indexes.size !== money.length) return reject(EXAMPLE_REJECT.MONEY); // khoảng giá "100-200k"

  let template = stock.text;
  for (const claim of [...money].sort((a, b) => b.index - a.index)) {
    const amount = Number(claim.key.slice('vnd:'.length));
    const hit = variants.find((v) => v.priceVnd === amount);
    if (hit === undefined) return reject(EXAMPLE_REJECT.MONEY);
    template =
      template.slice(0, claim.index) +
      `{price:${hit.id}}` +
      template.slice(claim.index + claim.raw.length);
  }
  stock.ids.forEach((id, slot) => {
    template = template.replace(sentinel(slot), `{stock:${id}}`);
  });

  const variantIds = [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[2] as string))];
  return { ok: true, template, variantIds };
}

function formatVnd(amount: number, lang: 'vi' | 'en'): string {
  const grouped = String(Math.round(amount)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    lang === 'vi' ? '.' : ',',
  );
  return lang === 'vi' ? `${grouped}đ` : `${grouped} VND`;
}

/**
 * Điền lại giá/tồn HIỆN TẠI vào mẫu (docs/10 §5.4). Biến thể đã mất hoặc không có tồn kho → `null`
 * (bỏ mẫu đó, không đưa số cũ vào prompt).
 */
export function fillExampleTemplate(
  template: string,
  variants: readonly ExampleVariant[],
  lang: 'vi' | 'en',
): string | null {
  let missing = false;
  const filled = template.replace(PLACEHOLDER, (_all, kind: string, id: string) => {
    const variant = variants.find((v) => v.id === id);
    if (variant === undefined) {
      missing = true;
      return '';
    }
    if (kind === 'price') return formatVnd(variant.priceVnd, lang);
    if (variant.stock === null) {
      missing = true;
      return '';
    }
    return String(variant.stock);
  });
  return missing ? null : filled;
}

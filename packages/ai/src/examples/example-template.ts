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

const reject = (code: ExampleRejectCode): BuildTemplateResult => ({ ok: false, code });

const ZERO_WIDTH = /[​-‍﻿]/g;
// "còn 7", "con 7" / "7 left", "7 in stock". Chỉ phần chữ số bị thay.
const STOCK_VI = /(?<=\b(?:còn|con)\s+)\d{1,6}(?!\d)/giu;
const STOCK_EN = /(?<![\d.,])\d{1,6}(?=\s+(?:left|in stock)\b)/giu;
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

/**
 * Che PII + thay giá/tồn bằng `{price:<id>}`/`{stock:<id>}`. `variants` là các biến thể của sản phẩm
 * mà câu nói đến; giá/tồn trong câu phải khớp đúng một trong số đó.
 */
export function buildExampleTemplate(
  text: string,
  variants: readonly ExampleVariant[],
): BuildTemplateResult {
  const masked = maskPii(text.normalize('NFKC').replace(ZERO_WIDTH, '')).trim();
  if (masked === '') return reject(EXAMPLE_REJECT.EMPTY);

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

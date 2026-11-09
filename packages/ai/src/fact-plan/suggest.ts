import { normalizeSearchText, type PolicyFactKind } from '@flow/shared';
import { findProvinces, PROVINCES } from './regions';

/**
 * ĐỀ XUẤT chính sách có cấu trúc từ văn bản (chính sách Shopify hoặc văn bản Owner nhập) — DRAFT-FACT-SLOTS PR 3. Quy tắc bất biến (ADR 017): mỗi đề xuất mang NGUYÊN VĂN câu làm bằng chứng, mọi số trong
 * `data` phải xuất hiện trong câu đó (`valueAppearsInEvidence`), câu mơ hồ (hai số khác nhau, ngưỡng "từ…", tỉnh không rõ kiểu) thì BỎ, không đoán. Kết quả chỉ được lưu `draft`; Owner duyệt mới vào fact plan.
 */
export type PolicySuggestion = {
  kind: PolicyFactKind;
  slot: string;
  data: Record<string, unknown>;
  evidence: string;
};

const MONEY = /(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(k|nghìn|ngàn|đ|d|vnđ|vnd|₫|đồng)(?![\p{L}\d])/giu;
const DAY_RANGE = /(\d{1,3})\s*(?:-|–|đến|tới|to)\s*(\d{1,3})\s*(?:ngày|days?)/iu;
const DAY_ONE = /(\d{1,3})\s*-?\s*(?:ngày|days?)(?![\p{L}])/giu;
const SENTENCE_SPLIT = /(?<=[.!?;])\s+|\n+/;

function sentencesOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(SENTENCE_SPLIT)
    .map((s) => s.replace(/^[\s\-*•#>]+/, '').trim())
    .filter((s) => s.length >= 8 && s.length <= 600);
}

function digitsOf(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? []);
}

/** Mọi số nguyên trong `data` (đệ quy) — trừ số đã chuẩn hóa từ nguồn (đơn vị k, năm → tháng) — phải có trong câu bằng chứng. `sourceNumbers` là số GỐC lấy từ câu. */
export function valueAppearsInEvidence(
  sourceNumbers: readonly number[],
  evidence: string,
): boolean {
  const have = digitsOf(evidence.replace(/(?<=\d)[.,](?=\d{3}\b)/g, ''));
  return sourceNumbers.every((n) => have.has(String(n)));
}

function moneyMinor(norm: string): { minor: number; source: number } | null {
  const all = [...norm.matchAll(MONEY)];
  if (all.length !== 1) return null;
  const m = all[0] as RegExpMatchArray;
  const source = Number((m[1] as string).replace(/[.,]/g, ''));
  const unit = (m[2] as string).toLowerCase();
  const minor = unit === 'k' || unit === 'nghìn' || unit === 'ngàn' ? source * 1000 : source;
  return Number.isFinite(minor) ? { minor, source } : null;
}

function days(norm: string): { min: number; max: number; source: number[] } | null {
  const range = DAY_RANGE.exec(norm);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return min <= max ? { min, max, source: [min, max] } : null;
  }
  const all = [...norm.matchAll(DAY_ONE)];
  if (all.length !== 1) return null;
  const n = Number((all[0] as RegExpMatchArray)[1]);
  return { min: n, max: n, source: [n] };
}

const isNegated = (norm: string, subject: RegExp): boolean =>
  new RegExp(String.raw`\b(khong|ko|chua|no)\b[^,.;]{0,30}${subject.source}`).test(norm) ||
  new RegExp(String.raw`${subject.source}[^,.;]{0,20}\b(khong|ko|not)\b`).test(norm);

function suggestReturns(sentence: string, norm: string): PolicySuggestion | null {
  if (!/\b(doi tra|doi hang|tra hang|hoan tien|hoan hang|return|refund|exchange)\b/.test(norm))
    return null;
  if (/\b(tu|tren|toi thieu|duoi|over|above|min)\b\s*\d/.test(norm)) return null;
  if (isNegated(norm, /(doi tra|doi|tra hang|hoan tien|hoan|return|refund)/)) {
    return {
      kind: 'returns',
      slot: 'returns',
      data: { days: null, none: true },
      evidence: sentence,
    };
  }
  const d = days(sentence);
  if (!d || d.min !== d.max) return null;
  if (!valueAppearsInEvidence(d.source, sentence)) return null;
  return { kind: 'returns', slot: 'returns', data: { days: d.max }, evidence: sentence };
}

function suggestWarranty(sentence: string, norm: string): PolicySuggestion | null {
  if (!/\b(bao hanh|warranty|guarantee)\b/.test(norm)) return null;
  if (isNegated(norm, /(bao hanh|warranty)/)) {
    return {
      kind: 'warranty',
      slot: 'warranty',
      data: { months: null, none: true },
      evidence: sentence,
    };
  }
  const all = [...norm.matchAll(/(\d{1,3})\s*(thang|nam|months?|years?)\b/g)];
  if (all.length !== 1) return null;
  const m = all[0] as RegExpMatchArray;
  const n = Number(m[1]);
  const months = /^(nam|years?)$/.test(m[2] as string) ? n * 12 : n;
  if (!valueAppearsInEvidence([n], sentence)) return null;
  return { kind: 'warranty', slot: 'warranty', data: { months }, evidence: sentence };
}

function suggestCod(sentence: string, norm: string): PolicySuggestion | null {
  if (!/\b(cod|thanh toan khi nhan hang|cash on delivery)\b/.test(norm)) return null;
  const value = !isNegated(norm, /(cod|thanh toan khi nhan hang|cash on delivery)/);
  return { kind: 'cod', slot: 'cod', data: { value }, evidence: sentence };
}

function suggestShipping(sentence: string, norm: string): PolicySuggestion | null {
  if (
    !/\b(phi ship|phi van chuyen|phi giao hang|ship|van chuyen|giao hang|shipping|delivery)\b/.test(
      norm,
    )
  )
    return null;
  if (/\b(tu|tren|toi thieu|mien phi|free|over|above)\b/.test(norm)) return null; // ngưỡng/miễn phí có điều kiện: Owner nhập tay
  const fee = moneyMinor(sentence);
  const range = days(sentence);
  if (!fee && !range) return null;
  const sourceNumbers = [...(fee ? [fee.source] : []), ...(range ? range.source : [])];
  if (!valueAppearsInEvidence(sourceNumbers, sentence)) return null;
  const provinces = findProvinces(sentence);
  const inner = /\bnoi thanh\b/.test(norm);
  if (provinces.length > 1) return null;
  if (provinces.length === 1 && !inner) return null; // tỉnh/thành không rõ kiểu (nội thành hay cả tỉnh) → không đoán
  if (provinces.length === 0 && !/\b(toan quoc|nationwide)\b/.test(norm)) return null;
  const common = {
    feeMinor: fee ? fee.minor : null,
    currency: 'VND',
    daysMin: range ? range.min : null,
    daysMax: range ? range.max : null,
  };
  if (provinces.length === 1) {
    const city = PROVINCES.find((p) => p.id === provinces[0])?.names[0] ?? (provinces[0] as string);
    const label = `Nội thành ${city}`;
    return {
      kind: 'ship_region',
      slot: normalizeSearchText(label).slice(0, 100),
      data: { kind: 'city', label, city, ...common },
      evidence: sentence,
    };
  }
  return {
    kind: 'ship_region',
    slot: 'toan quoc',
    data: { kind: 'nationwide', label: 'Toàn quốc', ...common },
    evidence: sentence,
  };
}

/** Một câu → tối đa một đề xuất mỗi loại; trùng (kind, slot) giữa các câu: câu đầu thắng, câu sau mâu thuẫn làm CẢ HAI bị bỏ (không đoán). */
export function suggestPolicyFacts(text: string): PolicySuggestion[] {
  const found = new Map<string, PolicySuggestion | null>();
  for (const sentence of sentencesOf(text)) {
    const norm = normalizeSearchText(sentence);
    for (const s of [
      suggestReturns(sentence, norm),
      suggestWarranty(sentence, norm),
      suggestCod(sentence, norm),
      suggestShipping(sentence, norm),
    ]) {
      if (!s) continue;
      const key = `${s.kind}:${s.slot}`;
      const prev = found.get(key);
      if (prev === undefined) found.set(key, s);
      else if (prev !== null && JSON.stringify(prev.data) !== JSON.stringify(s.data))
        found.set(key, null);
    }
  }
  return [...found.values()].filter((s): s is PolicySuggestion => s !== null);
}

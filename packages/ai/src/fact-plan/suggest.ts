import { normalizeSearchText, type PolicyFactKind } from '@flow/shared';
import { countryName } from './destinations';
import { findProvinces, PROVINCES } from './regions';
import { currencyOfCountry, qualitativeReturns, qualitativeShip } from './suggest-qualitative';

/** Bằng chứng gồm nhiều câu nguyên văn: nối bằng dấu này (mỗi đoạn là một câu trích nguyên văn). */
export const EVIDENCE_JOIN = ' ¦ ';

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

/** Tách văn bản chính sách thành câu (dùng chung với màn hình để liệt kê câu CHƯA phân tách được). */
export function sentencesOf(text: string): string[] {
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

const NOT_L = String.raw`(?<![\p{L}\p{N}])`;
const NOT_R = String.raw`(?![\p{L}\p{N}])`;
const EXCLUSION = new RegExp(
  `${NOT_L}(ngoại trừ|trừ|không áp dụng|chỉ áp dụng|chỉ|except|excluding|only|unless|not include|không bao gồm)${NOT_R}`,
  'iu',
);
const GENERIC_SCOPE = /^(sản phẩm|hàng|toàn bộ|tất cả|chính hãng|the product|all|everything)$/iu;
const CONDITION_LEAD = /^(?:sản phẩm|hàng hóa|hàng|the items?|items?|the product)\s+/iu;
const CONDITION_START =
  /(?:^|[\s,])(?<!từ\s)(?:nếu|với điều kiện|miễn là|khi|if|provided that|as long as|when)\s+(.+?)[.;!]?$/iu;
const CONDITION_SPLIT = new RegExp(String.raw`\s*(?:,|;|${NOT_L}(?:và|and)${NOT_R})\s*`, 'iu');

/** Điều kiện của đổi trả: phần sau "nếu/với điều kiện/if…", tách theo "và/,/;/and"; MỖI mục phải là chuỗi con NGUYÊN VĂN của câu. Không tách được hoặc có loại trừ → `review`. */
function returnConditions(sentence: string): { conditions: string[]; review: boolean } {
  const lead = CONDITION_START.exec(sentence);
  const exclusion = EXCLUSION.test(sentence);
  if (!lead) return { conditions: [], review: exclusion };
  const parts = (lead[1] as string)
    .split(CONDITION_SPLIT)
    .map((part) => part.trim().replace(CONDITION_LEAD, '').trim())
    .filter((part) => part.length > 0);
  const conditions = parts.filter((part) => sentence.includes(part));
  return {
    conditions,
    review: exclusion || conditions.length === 0 || conditions.length !== parts.length,
  };
}

const WARRANTY_BETWEEN = /bảo hành\s+(.+?)\s+\d{1,3}\s*(?:tháng|năm)/iu;
const WARRANTY_TRAILING = new RegExp(
  String.raw`bảo hành.*?\d{1,3}\s*(?:tháng|năm)\s+(?:cho|đối với)\s+(.+?)(?=\s+(?:kể từ|tính từ|từ)${NOT_R}|[.,;!]|$)`,
  'iu',
);
const WARRANTY_EN_LEAD = /^(.+?)\s+(?:are|is)\s+(?:under|covered by)\s+(?:a\s+)?warranty/iu;
const WARRANTY_EN_ON =
  /warranty\s+(?:on|for|covers)\s+(?:the\s+)?(.+?)(?=\s+(?:for|of)\s+\d|[.,;!]|$)/iu;

/** Phạm vi của bảo hành ("bảo hành đường may 3 tháng", "…cho thân máy", "Seams are under warranty…"): chép nguyên văn; có loại trừ mà không tách được → `review`. */
function warrantyScope(sentence: string): { scope: string | null; review: boolean } {
  const exclusion = EXCLUSION.test(sentence);
  const candidates: string[] = [];
  const between = WARRANTY_BETWEEN.exec(sentence);
  if (between) candidates.push((between[1] as string).replace(/^(?:cho|đối với|:)\s+/iu, ''));
  const trailing = WARRANTY_TRAILING.exec(sentence);
  if (trailing) candidates.push(trailing[1] as string);
  const enLead = WARRANTY_EN_LEAD.exec(sentence);
  if (enLead) candidates.push(enLead[1] as string);
  const enOn = WARRANTY_EN_ON.exec(sentence);
  if (enOn) candidates.push(enOn[1] as string);
  const scopes = candidates
    .map((c) =>
      c
        .replace(/chính hãng/giu, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((c) => c.length > 0 && !GENERIC_SCOPE.test(c));
  const scope = scopes.find((c) => sentence.includes(c)) ?? null;
  return { scope, review: exclusion && scope === null };
}

/** Cụm loại trừ/giới hạn KHÔNG phải "không có chính sách" ("không bao gồm phụ kiện"): bỏ trước khi xét phủ định. */
const withoutExclusions = (norm: string) =>
  norm.replace(/khong bao gom|khong ap dụng|khong ap dung|ngoai tru|not include|excluding/g, ' ');

function suggestReturns(sentence: string, norm: string): PolicySuggestion | null {
  if (
    !/\b(doi tra|doi hang|tra hang|hoan tien|hoan hang|returns?|refunds?|exchanges?)\b/.test(norm)
  )
    return null;
  if (/\b(tu|tren|toi thieu|duoi|over|above|min)\b\s*\d/.test(norm)) return null;
  if (isNegated(withoutExclusions(norm), /(doi tra|doi|tra hang|hoan tien|hoan|return|refund)/)) {
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
  const { conditions, review } = returnConditions(sentence);
  return {
    kind: 'returns',
    slot: 'returns',
    data: {
      days: d.max,
      ...(conditions.length > 0 ? { conditions } : {}),
      ...(review ? { needsReview: true } : {}),
    },
    evidence: sentence,
  };
}

function suggestWarranty(sentence: string, norm: string): PolicySuggestion | null {
  if (!/\b(bao hanh|warranty|guarantee)\b/.test(norm)) return null;
  if (isNegated(withoutExclusions(norm), /(bao hanh|warranty)/)) {
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
  const { scope, review } = warrantyScope(sentence);
  return {
    kind: 'warranty',
    slot: 'warranty',
    data: { months, ...(scope ? { scope } : {}), ...(review ? { needsReview: true } : {}) },
    evidence: sentence,
  };
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
  const result = [...found.values()].filter((s): s is PolicySuggestion => s !== null);
  return mergeQualitative(result, sentencesOf(text));
}

/** Gộp đề xuất ĐỊNH TÍNH (enum) vào dòng đã có cùng loại, hoặc tạo dòng mới khi chưa có số nào. Bằng chứng nối các câu liên quan (mỗi câu nguyên văn). */
function mergeQualitative(base: PolicySuggestion[], sentences: string[]): PolicySuggestion[] {
  const out = [...base];
  const returns = qualitativeReturns(sentences);
  if (returns) {
    const enums = {
      ...(returns.refundTo ? { refundTo: returns.refundTo } : {}),
      ...(returns.returnShippingPaidBy
        ? { returnShippingPaidBy: returns.returnShippingPaidBy }
        : {}),
      ...(returns.eligibility ? { eligibility: returns.eligibility } : {}),
    };
    const existing = out.find((s) => s.kind === 'returns');
    if (existing) {
      existing.data = { ...existing.data, ...enums };
      existing.evidence = [...new Set([existing.evidence, ...returns.evidence])].join(
        EVIDENCE_JOIN,
      );
    } else {
      out.push({
        kind: 'returns',
        slot: 'returns',
        data: { days: null, ...enums },
        evidence: returns.evidence.join(EVIDENCE_JOIN),
      });
    }
  }
  const ship = qualitativeShip(sentences);
  if (ship && !out.some((s) => s.kind === 'ship_region')) {
    const first = ship.destinations[0] as string;
    const label = countryName(first, 'en').replace(/^the /, '');
    out.push({
      kind: 'ship_region',
      slot: normalizeSearchText(label).slice(0, 100),
      data: {
        kind: 'nationwide',
        label,
        feeMinor: null,
        currency: currencyOfCountry(first),
        daysMin: null,
        daysMax: null,
        destinations: ship.destinations,
        ...(ship.feeMode ? { feeMode: ship.feeMode } : {}),
        ...(ship.daysMode ? { daysMode: ship.daysMode } : { daysMode: 'not_stated' }),
      },
      evidence: ship.evidence.join(EVIDENCE_JOIN),
    });
  }
  return out;
}

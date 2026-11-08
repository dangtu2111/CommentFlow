/**
 * Guard số tiền / % / ngày / SĐT / email / link (FR-030, docs/09 §4 bước `guard`).
 *
 * Hàm THUẦN, không gọi LLM/DB: mọi con số "có giá trị" trong câu AI soạn phải xuất hiện trong văn bản
 * nguồn đã đưa vào prompt (hoặc trong bảng giá đọc từ `products`). Số lạ → vi phạm; bước sau
 * (độ tin cậy / `decideAction`) ép "cần người", không tự gửi (nguyên tắc bất biến #3, #4).
 * AI tự tính tổng/giảm giá/phí ship sẽ ra số không có trong nguồn nên bị bắt tự nhiên.
 *
 * Cách làm: mỗi loại được rút ra thành "khóa chuẩn hóa" (150k ≡ 150.000đ; +84 912… ≡ 0912…); đối chiếu
 * theo khóa. Các loại được quét tuần tự và "tiêu thụ" phần đã khớp để một chuỗi không bị đếm hai lần
 * (số trong link không thành số tiền).
 */

export type GuardClaimKind = 'money' | 'number' | 'percent' | 'date' | 'phone' | 'email' | 'link';

type DateParts = { d?: number; m?: number; y?: number };

export type GuardClaim = {
  kind: GuardClaimKind;
  /** Khóa chuẩn hóa để so khớp; vd `vnd:150000`, `tel:0912345678`. */
  key: string;
  /** Chuỗi gốc trong văn bản (chỉ dùng nội bộ — có thể là PII; không đưa vào vi phạm). */
  raw: string;
  date?: DateParts;
  index: number;
  /** Khóa thay thế được chấp nhận: cùng GIÁ TRỊ viết khác dấu phân cách nghìn ("4,765" ↔ "4765"); chỉ cho số KHÔNG kèm đơn vị tiền. */
  alt?: string;
};

export type GuardViolation = {
  kind: GuardClaimKind;
  /** Mô tả đã che PII: SĐT → `[sđt]`, email → `[email]`; loại khác giữ nguyên chuỗi trong câu. */
  display: string;
};

export type GuardMoneyInput = {
  /** Câu AI soạn. */
  reply: string;
  /** Văn bản các nguồn đã đưa vào prompt (đoạn kiến thức, thẻ sản phẩm đã dựng thành chữ…). */
  sources: readonly string[];
  /** Giá (đồng) đọc thẳng từ `products`/`product_variants` — luôn là nguồn hợp lệ. */
  knownPricesVnd?: readonly number[];
};

export type GuardMoneyResult = {
  ok: boolean;
  violations: GuardViolation[];
  /** Số khẳng định khác nhau đã kiểm. */
  claimsChecked: number;
};

const NOT_AFTER_NUM = String.raw`(?<!\p{N}|\p{N}[.,])`;
const EMAIL = /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_SCHEME = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/giu;
const BARE_DOMAIN =
  /(?<![\p{L}\p{N}@./-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|vn|net|org|io|me|app|shop|store|xyz|info|co|edu|gov|ly|page|link|online|site|biz|cc|asia|tv|top|club|vip|pro|tech|live|click|website|world|today)(?:\/[^\s<>"')\]]*)?(?![\p{L}\p{N}-])/giu;
// Đuôi bất kỳ nhưng bắt buộc có đường dẫn (vd "muahang.xyz123/sp1").
const BARE_PATH =
  /(?<![\p{L}\p{N}@./-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\/[^\s<>"')\]]+/giu;
// Di động/bàn VN: 0 hoặc 84/+84 (có thể trong ngoặc) rồi 9–10 chữ số, phân cách tối đa 3 ký tự (. - khoảng trắng);
// tổng đài 1800/1900.
const PHONE =
  /(?<![\p{N}+]|\p{N}[.,])\(?(?:\+?84|0)\)?[\s.-]{0,3}\d(?:[\s.-]{0,3}\d){8,9}(?![\p{N}])|(?<![\p{N}])1[89]00[\s.-]?\d{4,6}(?![\p{N}])/gu;
const DATE_ISO = /(?<![\p{N}])(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?![\p{N}])/gu;
const DATE_VERBAL = /(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?(?![\p{N}])/giu;
const DATE_NUMERIC = /(?<![\p{N}.,/-])(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{4}|\d{2}))?(?![\p{N}])/gu;
// "đến 30-11", "hết 30.11": không năm nhưng đứng sau từ chỉ hạn/ngày → là ngày.
const DATE_CONTEXT = /(?:đến|hết|từ|trước|sau|ngày)\s+(\d{1,2})([.-])(\d{1,2})(?![\p{N}.,/-])/giu;
const DAY_ONLY = /(?:ngày|mùng|mồng)\s+(\d{1,2})(?![\p{N}])/giu;
const MONTH_ONLY = /tháng\s+(\d{1,2})(?![\p{N}])/giu;
const PCT_WORD = '(?:%|phần trăm|phan tram)';
const PERCENT_RANGE = new RegExp(
  `${NOT_AFTER_NUM}(\\d+(?:[.,]\\d+)?)\\s*[-–—]\\s*(\\d+(?:[.,]\\d+)?)\\s*${PCT_WORD}`,
  'giu',
);
const PERCENT = new RegExp(`${NOT_AFTER_NUM}(\\d+(?:[.,]\\d+)?)\\s*${PCT_WORD}`, 'giu');
const UNIT = '(k|nghìn|nghin|ngàn|ngan|tr|triệu|trieu|tỷ|tỉ|ty)';
const MONEY_RANGE = new RegExp(
  `${NOT_AFTER_NUM}(\\d+(?:[.,]\\d+)?)\\s*[-–—]\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT}(?![\\p{L}\\p{N}])`,
  'giu',
);
// Sau đơn vị có thể có phần lẻ: "2tr5", "1 triệu 2", "1 triệu rưỡi", "2 triệu mốt".
const MONEY_UNIT = new RegExp(
  `${NOT_AFTER_NUM}(\\d+(?:[.,]\\d+)?)\\s*${UNIT}(?:\\s*(\\d{1,3})|\\s+(rưỡi|mốt))?(?![\\p{L}\\p{N}])`,
  'giu',
);
const MONEY_CURRENCY = new RegExp(
  `${NOT_AFTER_NUM}(\\d{1,3}(?:[.,]\\d{3})+|\\d+)\\s*(?:đồng|dong|vnđ|vnd|đ|₫|d)(?![\\p{L}\\p{N}])`,
  'giu',
);
const MONEY_GROUPED = new RegExp(`${NOT_AFTER_NUM}\\d{1,3}(?:[.,]\\d{3})+(?![\\p{N}])`, 'gu');
// Số trần ≥3 chữ số còn sót (không đơn vị/ký hiệu): coi là có thể là giá → phải có trong nguồn.
const BARE_NUMBER = new RegExp(`${NOT_AFTER_NUM}\\d{3,}(?!\\p{N}|[.,]\\p{N})`, 'gu');

const UNIT_MULTIPLIER: Record<string, number> = {
  k: 1e3,
  nghìn: 1e3,
  nghin: 1e3,
  ngàn: 1e3,
  ngan: 1e3,
  tr: 1e6,
  triệu: 1e6,
  trieu: 1e6,
  tỷ: 1e9,
  tỉ: 1e9,
  ty: 1e9,
};
const WORD_TAIL: Record<string, string> = { rưỡi: '5', mốt: '1' };

const toNumber = (s: string): number => Number(s.replace(',', '.'));
const vnd = (n: number): string => `vnd:${Math.round(n)}`;
const validDay = (d: number): boolean => d >= 1 && d <= 31;
const validMonth = (m: number): boolean => m >= 1 && m <= 12;

/** "1.500k" → dấu chấm là phân cách nghìn (1500 nghìn); "1,5tr" → thập phân; "2tr5" → 2,5. */
function unitAmount(num: string, unit: string, tail?: string): number {
  const mult = UNIT_MULTIPLIER[unit.toLowerCase()] as number;
  const grouped = /^\d{1,3}(?:[.,]\d{3})+$/.test(num);
  const base = grouped ? num.replace(/[.,]/g, '') : num.replace(',', '.');
  const full = tail === undefined || base.includes('.') ? base : `${base}.${tail}`;
  return Number(full) * mult;
}

function dateKey(p: DateParts): string {
  const parts: string[] = [];
  if (p.d !== undefined) parts.push(`d=${p.d}`);
  if (p.m !== undefined) parts.push(`m=${p.m}`);
  if (p.y !== undefined) parts.push(`y=${p.y}`);
  return `date:${parts.join(';')}`;
}

function normalizeLink(raw: string): string {
  return `url:${raw
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[.,;:!?]+$/, '')
    .replace(/\/+$/, '')}`;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return `tel:${digits.startsWith('84') ? `0${digits.slice(2)}` : digits}`;
}

/** Trả `null` = không phải khẳng định (giữ nguyên chuỗi, không tiêu thụ). */
type Extract = (m: RegExpExecArray) => Omit<GuardClaim, 'raw' | 'index'>[] | null;

/** Quét `regex`, ghi khẳng định, thay phần khớp bằng khoảng trắng cùng độ dài (giữ vị trí). */
function scan(
  work: { text: string },
  regex: RegExp,
  kind: GuardClaimKind,
  extract: Extract,
  out: GuardClaim[],
) {
  const matches = [...work.text.matchAll(regex)] as RegExpExecArray[];
  for (const m of matches) {
    const found = extract(m);
    if (found === null) continue;
    for (const c of found) out.push({ ...c, kind, raw: m[0], index: m.index });
    work.text =
      work.text.slice(0, m.index) +
      ' '.repeat(m[0].length) +
      work.text.slice(m.index + m[0].length);
  }
}

const dateClaim = (d?: number, m?: number, y?: number) => {
  const date: DateParts = {};
  if (d !== undefined) date.d = d;
  if (m !== undefined) date.m = m;
  if (y !== undefined) date.y = y;
  return [{ kind: 'date' as const, key: dateKey(date), date }];
};

const moneyClaims = (...amounts: number[]) =>
  amounts.map((n) => ({ kind: 'money' as const, key: vnd(n) }));

/**
 * Rút mọi khẳng định kiểm được (tiền, %, ngày, SĐT, email, link, số trần ≥3 chữ số) khỏi một đoạn văn,
 * theo thứ tự xuất hiện. Chuẩn hóa NFKC + bỏ ký tự rộng 0 trước (chống lách bằng Unicode).
 * `raw` có thể chứa PII — bên gọi không được log.
 */
export function extractClaims(text: string): GuardClaim[] {
  const work = { text: text.normalize('NFKC').replace(/[​-‍﻿]/g, '') };
  const out: GuardClaim[] = [];

  scan(work, EMAIL, 'email', (m) => [{ kind: 'email', key: `mail:${m[0].toLowerCase()}` }], out);
  const link: Extract = (m) => [{ kind: 'link', key: normalizeLink(m[0]) }];
  scan(work, URL_SCHEME, 'link', link, out);
  scan(work, BARE_DOMAIN, 'link', link, out);
  scan(work, BARE_PATH, 'link', link, out);
  scan(work, PHONE, 'phone', (m) => [{ kind: 'phone', key: normalizePhone(m[0]) }], out);

  scan(
    work,
    DATE_ISO,
    'date',
    (m) => {
      const [d, mo] = [Number(m[4]), Number(m[3])];
      return validDay(d) && validMonth(mo) ? dateClaim(d, mo, Number(m[1])) : null;
    },
    out,
  );
  scan(
    work,
    DATE_VERBAL,
    'date',
    (m) => {
      const [d, mo] = [Number(m[1]), Number(m[2])];
      return validDay(d) && validMonth(mo)
        ? dateClaim(d, mo, m[3] === undefined ? undefined : Number(m[3]))
        : null;
    },
    out,
  );
  scan(
    work,
    DATE_NUMERIC,
    'date',
    (m) => {
      const [d, mo] = [Number(m[1]), Number(m[3])];
      const year = m[4] === undefined ? undefined : Number(m[4]) + (m[4].length === 2 ? 2000 : 0);
      if (!validDay(d) || !validMonth(mo)) return null;
      if (m[2] !== '/' && year === undefined) return null; // "15.11" có thể là số thập phân
      return dateClaim(d, mo, year);
    },
    out,
  );
  scan(
    work,
    DATE_CONTEXT,
    'date',
    (m) =>
      validDay(Number(m[1])) && validMonth(Number(m[3]))
        ? dateClaim(Number(m[1]), Number(m[3]))
        : null,
    out,
  );

  scan(
    work,
    PERCENT_RANGE,
    'percent',
    (m) =>
      [m[1], m[2]].map((n) => ({ kind: 'percent' as const, key: `pct:${toNumber(n as string)}` })),
    out,
  );
  scan(
    work,
    PERCENT,
    'percent',
    (m) => [{ kind: 'percent', key: `pct:${toNumber(m[1] as string)}` }],
    out,
  );

  scan(
    work,
    MONEY_RANGE,
    'money',
    (m) =>
      moneyClaims(
        unitAmount(m[1] as string, m[3] as string),
        unitAmount(m[2] as string, m[3] as string),
      ),
    out,
  );
  scan(
    work,
    MONEY_UNIT,
    'money',
    (m) => {
      const tail = m[3] ?? WORD_TAIL[(m[4] ?? '').toLowerCase()];
      return moneyClaims(unitAmount(m[1] as string, m[2] as string, tail));
    },
    out,
  );
  scan(
    work,
    MONEY_CURRENCY,
    'money',
    (m) => moneyClaims(Number((m[1] as string).replace(/[.,]/g, ''))),
    out,
  );
  scan(
    work,
    MONEY_GROUPED,
    'money',
    (m) => {
      const value = Number(m[0].replace(/[.,]/g, ''));
      // Số có dấu phân cách nghìn nhưng KHÔNG kèm đơn vị tiền: cũng khớp khi nguồn ghi đúng số đó trần ("4765").
      return value >= 1000
        ? moneyClaims(value).map((c) => ({ ...c, alt: `num:${m[0].replace(/[.,]/g, '')}` }))
        : null;
    },
    out,
  );

  // Ngày/tháng đơn lẻ quét SAU tiền để "ngày 30k"/"tháng 2 triệu" không bị nuốt mất số tiền.
  scan(
    work,
    DAY_ONLY,
    'date',
    (m) => (validDay(Number(m[1])) ? dateClaim(Number(m[1])) : null),
    out,
  );
  scan(
    work,
    MONTH_ONLY,
    'date',
    (m) => (validMonth(Number(m[1])) ? dateClaim(undefined, Number(m[1])) : null),
    out,
  );
  scan(
    work,
    BARE_NUMBER,
    'number',
    (m) => [
      {
        kind: 'number',
        key: `num:${m[0]}`,
        // Ngược lại: số trần khớp khi nguồn ghi đúng số đó có dấu phân cách ("4,765").
        ...(Number(m[0]) >= 1000 ? { alt: vnd(Number(m[0])) } : {}),
      },
    ],
    out,
  );

  return out.sort((a, b) => a.index - b.index);
}

function displayOf(c: GuardClaim): string {
  if (c.kind === 'phone') return '[sđt]';
  if (c.kind === 'email') return '[email]';
  if (c.kind === 'link')
    return (
      c.key
        .slice('url:'.length)
        .split('?')[0]
        ?.replace(/\d{8,}/g, '[sđt]') ?? ''
    );
  return c.raw.trim();
}

/** Mỗi trường câu nói đến phải được một ngày trong nguồn có CÙNG giá trị (nguồn thiếu trường → không đủ). */
function dateSupported(claim: DateParts, sourceDates: readonly DateParts[]): boolean {
  return sourceDates.some((s) =>
    (['d', 'm', 'y'] as const).every((f) => claim[f] === undefined || claim[f] === s[f]),
  );
}

/**
 * Kiểm câu trả lời so với nguồn. `ok = false` khi có ít nhất một khẳng định không có trong nguồn.
 * Vi phạm đã che PII (không chứa SĐT/email thô).
 */
export function checkGuardMoney(input: GuardMoneyInput): GuardMoneyResult {
  const sourceClaims = input.sources.flatMap((s) => extractClaims(s));
  const sourceKeys = new Set(sourceClaims.map((c) => c.key));
  for (const price of input.knownPricesVnd ?? []) sourceKeys.add(vnd(price));
  const sourceDates = sourceClaims.flatMap((c) => (c.date ? [c.date] : []));

  const seen = new Set<string>();
  const violations: GuardViolation[] = [];
  for (const claim of extractClaims(input.reply)) {
    if (seen.has(claim.key)) continue;
    seen.add(claim.key);
    const supported = claim.date
      ? dateSupported(claim.date, sourceDates)
      : sourceKeys.has(claim.key) || (claim.alt !== undefined && sourceKeys.has(claim.alt));
    if (!supported) violations.push({ kind: claim.kind, display: displayOf(claim) });
  }
  return { ok: violations.length === 0, violations, claimsChecked: seen.size };
}

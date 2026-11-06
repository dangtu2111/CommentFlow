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

export type GuardClaimKind = 'money' | 'percent' | 'date' | 'phone' | 'email' | 'link';

type DateParts = { d?: number; m?: number; y?: number };

export type GuardClaim = {
  kind: GuardClaimKind;
  /** Khóa chuẩn hóa để so khớp; vd `vnd:150000`, `tel:0912345678`. */
  key: string;
  /** Chuỗi gốc trong văn bản (chỉ dùng nội bộ — có thể là PII; không đưa vào vi phạm). */
  raw: string;
  date?: DateParts;
  index: number;
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

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_SCHEME = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/giu;
const BARE_DOMAIN =
  /(?<![\p{L}\p{N}@./-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|vn|net|org|io|me|app|shop|store|xyz|info|co|edu|gov|ly|page|link)(?:\/[^\s<>"')\]]*)?(?![\p{L}\p{N}-])/giu;
// Di động/bàn VN: 0 hoặc 84/+84 rồi 9–10 chữ số (cho phép . - khoảng trắng); tổng đài 1800/1900.
const PHONE =
  /(?<![\p{N}+])(?:\+?84|0)[\s.-]?\d(?:[\s.-]?\d){8,9}(?![\p{N}])|(?<![\p{N}])1[89]00[\s.-]?\d{4,6}(?![\p{N}])/gu;
const DATE_ISO = /(?<![\p{N}])(\d{4})-(\d{1,2})-(\d{1,2})(?![\p{N}])/gu;
const DATE_VERBAL = /(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?(?![\p{N}])/giu;
const DATE_NUMERIC = /(?<![\p{N}.,/-])(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{4}|\d{2}))?(?![\p{N}])/gu;
const DAY_ONLY = /ngày\s+(\d{1,2})(?![\p{N}])/giu;
const MONTH_ONLY = /tháng\s+(\d{1,2})(?![\p{N}])/giu;
const PERCENT = /(?<![\p{N}.,])(\d+(?:[.,]\d+)?)\s*(?:%|phần trăm|phan tram)/giu;
const UNIT = '(k|nghìn|ngàn|tr|triệu|tỷ)';
const MONEY_RANGE = new RegExp(
  `(?<![\\p{N}.,])(\\d+(?:[.,]\\d+)?)\\s*[-–—]\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT}(?![\\p{L}\\p{N}])`,
  'giu',
);
const MONEY_UNIT = new RegExp(
  `(?<![\\p{N}.,])(\\d+(?:[.,]\\d+)?)\\s*${UNIT}(\\d{1,3})?(?![\\p{L}\\p{N}])`,
  'giu',
);
const MONEY_CURRENCY =
  /(?<![\p{N}.,])(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:đ|₫|vnd|vnđ|đồng)(?![\p{L}\p{N}])/giu;
const MONEY_GROUPED = /(?<![\p{N}.,])\d{1,3}(?:[.,]\d{3})+(?![\p{N}])/gu;

const UNIT_MULTIPLIER: Record<string, number> = {
  k: 1e3,
  nghìn: 1e3,
  ngàn: 1e3,
  tr: 1e6,
  triệu: 1e6,
  tỷ: 1e9,
};

const toNumber = (s: string): number => Number(s.replace(',', '.'));
const vnd = (n: number): string => `vnd:${Math.round(n)}`;
const validDay = (d: number): boolean => d >= 1 && d <= 31;
const validMonth = (m: number): boolean => m >= 1 && m <= 12;

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

/** Rút mọi khẳng định kiểm được (tiền, %, ngày, SĐT, email, link) khỏi một đoạn văn. Theo thứ tự xuất hiện. */
export function extractClaims(text: string): GuardClaim[] {
  const work = { text };
  const out: GuardClaim[] = [];
  const tail = (s: string | undefined) => (s === undefined ? '' : `.${s}`);

  scan(work, EMAIL, 'email', (m) => [{ kind: 'email', key: `mail:${m[0].toLowerCase()}` }], out);
  const link: Extract = (m) => [{ kind: 'link', key: normalizeLink(m[0]) }];
  scan(work, URL_SCHEME, 'link', link, out);
  scan(work, BARE_DOMAIN, 'link', link, out);
  scan(work, PHONE, 'phone', (m) => [{ kind: 'phone', key: normalizePhone(m[0]) }], out);

  scan(
    work,
    DATE_ISO,
    'date',
    (m) => {
      const [d, mo] = [Number(m[3]), Number(m[2])];
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

  scan(work, PERCENT, 'percent', (m) => [{ kind: 'percent', key: `pct:${toNumber(m[1]!)}` }], out);

  scan(
    work,
    MONEY_RANGE,
    'money',
    (m) => {
      const mult = UNIT_MULTIPLIER[m[3]!.toLowerCase()]!;
      return [m[1]!, m[2]!].map((n) => ({ kind: 'money' as const, key: vnd(toNumber(n) * mult) }));
    },
    out,
  );
  scan(
    work,
    MONEY_UNIT,
    'money',
    (m) => {
      const mult = UNIT_MULTIPLIER[m[2]!.toLowerCase()]!;
      // "2tr5" = 2,5 triệu; "2tr150" = 2,15 triệu
      const num = m[3] === undefined ? m[1]! : `${m[1]!.replace(',', '.')}${tail(m[3])}`;
      return [{ kind: 'money', key: vnd(toNumber(num) * mult) }];
    },
    out,
  );
  scan(
    work,
    MONEY_CURRENCY,
    'money',
    (m) => [{ kind: 'money', key: vnd(Number(m[1]!.replace(/[.,]/g, ''))) }],
    out,
  );
  scan(
    work,
    MONEY_GROUPED,
    'money',
    (m) => {
      const value = Number(m[0].replace(/[.,]/g, ''));
      return value >= 1000 ? [{ kind: 'money', key: vnd(value) }] : null;
    },
    out,
  );

  return out.sort((a, b) => a.index - b.index);
}

function displayOf(c: GuardClaim): string {
  if (c.kind === 'phone') return '[sđt]';
  if (c.kind === 'email') return '[email]';
  return c.kind === 'link' ? c.key.slice('url:'.length) : c.raw.trim();
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
      : sourceKeys.has(claim.key);
    if (!supported) violations.push({ kind: claim.kind, display: displayOf(claim) });
  }
  return { ok: violations.length === 0, violations, claimsChecked: seen.size };
}

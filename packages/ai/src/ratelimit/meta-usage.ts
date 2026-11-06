/**
 * Đọc mức dùng Meta App từ header Graph API (FR-114, docs/09 §11.1). Theo tài liệu chính thức Meta
 * (Graph API → Rate Limiting): `X-App-Usage` = `{call_count, total_cputime, total_time}` (phần trăm 0–100);
 * `X-Business-Use-Case-Usage` = `{<id>: [{type, call_count, total_cputime, total_time, estimated_time_to_regain_access}]}`.
 * Trả số lớn nhất hợp lệ (0–100); không đọc được → `null` (= không có thông tin, KHÔNG bịa số). Không ném.
 */
const USAGE_FIELDS = ['call_count', 'total_cputime', 'total_time'] as const;

export type HeaderBag = Readonly<Record<string, string | string[] | undefined>>;

function headerValue(headers: HeaderBag, name: string): string | null {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    const text = Array.isArray(value) ? value[0] : value;
    return typeof text === 'string' ? text : null;
  }
  return null;
}

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function collect(entry: unknown, into: number[]): void {
  if (!isRecord(entry)) return;
  for (const field of USAGE_FIELDS) {
    const v = entry[field];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) into.push(Math.min(v, 100));
  }
}

export function parseMetaUsagePercent(headers: HeaderBag): number | null {
  const found: number[] = [];
  collect(parseJson(headerValue(headers, 'x-app-usage')), found);
  const business = parseJson(headerValue(headers, 'x-business-use-case-usage'));
  if (isRecord(business)) {
    for (const entries of Object.values(business)) {
      if (Array.isArray(entries)) for (const entry of entries) collect(entry, found);
    }
  }
  return found.length === 0 ? null : Math.max(...found);
}

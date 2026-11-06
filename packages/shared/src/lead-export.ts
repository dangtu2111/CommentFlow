import { strToU8, zipSync } from 'fflate';
import { maskPii } from './pii';

/**
 * Xuất khách tiềm năng ra CSV/XLSX (FR-082, Q-LEX1). Logic thuần + interface nguồn (`LeadExportSource`); chưa nối DB/UI.
 *
 * - Chỉ ĐỌC dữ liệu đã lưu: không gọi nền tảng, nên không chạm luật Meta (cửa sổ 24 giờ/7 ngày, Private Reply 1 tin
 *   ≤ 7 ngày — docs/09); xuất tệp không phải là "gửi tin".
 * - PII (nguyên tắc #6): SĐT/email mặc định bị che; chỉ Owner + cấu hình `full` + yêu cầu rõ mới ra đầy đủ. Dù nguồn
 *   lỡ trả số đầy đủ, ở chế độ che/ẩn số đó không bao giờ vào tệp. Lỗi không chứa dữ liệu khách.
 * - Tệp bảng tính là dữ liệu không tin cậy với người mở: mọi ô chữ chống chèn công thức (`sanitizeExportText`).
 * - Giới hạn: `maxRows` (trần cứng `LEAD_EXPORT_HARD_MAX_ROWS`) và `LEAD_EXPORT_MAX_BYTES`; vượt → lỗi, không cắt dở.
 */
export const LEAD_EXPORT_HARD_MAX_ROWS = 20_000;
export const LEAD_EXPORT_DEFAULT_MAX_ROWS = 5000;
export const LEAD_EXPORT_MAX_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 200;

export type LeadExportFormat = 'csv' | 'xlsx';
export type LeadExportPhoneMode = 'hidden' | 'masked' | 'full';
export type LeadExportRole = 'owner' | 'admin' | 'staff';

export type LeadExportErrorCode =
  | 'LEADS_EXPORT_DISABLED'
  | 'LEADS_EXPORT_FORBIDDEN'
  | 'LEADS_EXPORT_TOO_LARGE'
  | 'LEADS_EXPORT_SOURCE_FAILED'
  | 'LEADS_EXPORT_CONFIG_INVALID';

export class LeadExportError extends Error {
  constructor(readonly code: LeadExportErrorCode) {
    super(code);
    this.name = 'LeadExportError';
  }
}

export type LeadExportConfig = {
  enabled: boolean;
  phoneMode: LeadExportPhoneMode;
  maxRows: number;
};

const MODES: readonly LeadExportPhoneMode[] = ['hidden', 'masked', 'full'];
const modeRank = (mode: LeadExportPhoneMode) => MODES.indexOf(mode);

/** Đọc cấu hình từ biến môi trường: `LEADS_EXPORT_ENABLED` (mặc định TẮT), `_PHONE_MODE`, `_MAX_ROWS`. */
export function readLeadExportConfig(env: Record<string, string | undefined>): LeadExportConfig {
  const invalid = () => new LeadExportError('LEADS_EXPORT_CONFIG_INVALID');
  const flag = env.LEADS_EXPORT_ENABLED?.trim().toLowerCase() ?? '';
  if (!['', 'true', 'false'].includes(flag)) throw invalid();
  const mode = (env.LEADS_EXPORT_PHONE_MODE?.trim() || 'masked') as LeadExportPhoneMode;
  if (!MODES.includes(mode)) throw invalid();
  const rawRows = env.LEADS_EXPORT_MAX_ROWS?.trim();
  let maxRows = LEAD_EXPORT_DEFAULT_MAX_ROWS;
  if (rawRows) {
    if (!/^\d+$/.test(rawRows) || Number(rawRows) < 1) throw invalid();
    maxRows = Math.min(Number(rawRows), LEAD_EXPORT_HARD_MAX_ROWS);
  }
  return { enabled: flag === 'true', phoneMode: mode, maxRows };
}

/** Một lead để xuất. `phone`/`email` đầy đủ chỉ có khi nguồn được yêu cầu `revealContacts`. */
export type LeadExportRow = {
  id: string;
  createdAt: Date;
  stage: string;
  sourceType: string;
  name: string | null;
  phoneLast4: string | null;
  phone: string | null;
  email: string | null;
  hasEmail: boolean;
  note: string | null;
  assignedTo: string | null;
};

export interface LeadExportPageSource {
  /** Đọc một trang theo con trỏ (`null` = trang đầu); `nextCursor: null` = hết. */
  readPage(
    cursor: string | null,
    limit: number,
    options: { revealContacts: boolean },
  ): Promise<{ rows: LeadExportRow[]; nextCursor: string | null }>;
}

export type LeadExportRequest = {
  source: LeadExportPageSource;
  viewer: { role: LeadExportRole };
  config: LeadExportConfig;
  format: LeadExportFormat;
  /** Chế độ muốn dùng; bỏ trống → che (hoặc ẩn nếu cấu hình là ẩn). Không bao giờ nới hơn cấu hình. */
  phoneMode?: LeadExportPhoneMode;
  now: Date;
};

export type LeadExportResult = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  rowCount: number;
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: cần nhận diện ký tự điều khiển không hợp lệ trong XML
const XML_BAD_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Excel bỏ qua ký tự điều khiển đầu ô trước khi đọc công thức
const FORMULA_START = /^[\t\r]|^[\s\u0000-\u001f]*[=+\-@]/;

/**
 * Làm sạch ô chữ: bỏ ký tự điều khiển không hợp lệ trong XML, rồi nếu ô (kể cả sau khoảng trắng đầu) bắt đầu bằng
 * `= + - @` thì thêm `'` ở đầu để Excel/Sheets không coi là công thức. Lũy đẳng.
 */
export function sanitizeExportText(value: string): string {
  const clean = value.replace(XML_BAD_CHARS, '');
  return FORMULA_START.test(clean) ? `'${clean}` : clean;
}

/** `thu@mien.vn` → `t***@mien.vn`; không phải email → `***`. */
export function maskLeadEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

const maskedPhone = (last4: string) => `••••••${last4}`;

function resolveMode(request: LeadExportRequest): LeadExportPhoneMode {
  const { config, viewer } = request;
  // docs/13 §3.1: chỉ Owner được xuất khách tiềm năng (kể cả bản che số).
  if (viewer.role !== 'owner') throw new LeadExportError('LEADS_EXPORT_FORBIDDEN');
  const fallback = modeRank(config.phoneMode) <= modeRank('masked') ? config.phoneMode : 'masked';
  const mode = request.phoneMode ?? fallback;
  if (modeRank(mode) > modeRank(config.phoneMode))
    throw new LeadExportError('LEADS_EXPORT_FORBIDDEN');
  return mode;
}

function assertConfig(config: LeadExportConfig): void {
  const ok =
    Number.isInteger(config.maxRows) &&
    config.maxRows >= 1 &&
    config.maxRows <= LEAD_EXPORT_HARD_MAX_ROWS;
  if (!ok) throw new LeadExportError('LEADS_EXPORT_CONFIG_INVALID');
}

/** Văn bản tự do (tên/ghi chú) có thể chép SĐT/email: che trừ khi đang xuất đầy đủ. */
const freeText = (value: string | null, mode: LeadExportPhoneMode) =>
  mode === 'full' ? (value ?? '') : maskPii(value ?? '');

type Column = { header: string; value: (row: LeadExportRow, mode: LeadExportPhoneMode) => string };

function phoneCell(row: LeadExportRow, mode: LeadExportPhoneMode): string {
  if (mode === 'full' && row.phone) return row.phone;
  const last4 = row.phoneLast4?.replace(/\D/g, '').slice(-4) ?? '';
  return last4 ? maskedPhone(last4) : '';
}

function emailCell(row: LeadExportRow, mode: LeadExportPhoneMode): string {
  if (mode === 'full' && row.email) return row.email;
  if (row.email) return maskLeadEmail(row.email);
  return row.hasEmail ? '***' : '';
}

const COLUMNS: Column[] = [
  { header: 'created_at', value: (r) => r.createdAt.toISOString() },
  { header: 'stage', value: (r) => r.stage },
  { header: 'source', value: (r) => r.sourceType },
  { header: 'name', value: (r, m) => freeText(r.name, m) },
  { header: 'phone', value: phoneCell },
  { header: 'email', value: emailCell },
  { header: 'note', value: (r, m) => freeText(r.note, m) },
  { header: 'assigned_to', value: (r) => r.assignedTo ?? '' },
];

const columnsFor = (mode: LeadExportPhoneMode) =>
  mode === 'hidden' ? COLUMNS.filter((c) => c.header !== 'phone' && c.header !== 'email') : COLUMNS;

async function collectRows(
  request: LeadExportRequest,
  revealContacts: boolean,
): Promise<LeadExportRow[]> {
  const { source, config } = request;
  const rows: LeadExportRow[] = [];
  let cursor: string | null = null;
  try {
    for (let page = 0; ; page += 1) {
      const want = Math.min(PAGE_SIZE, config.maxRows + 1 - rows.length);
      const result = await source.readPage(cursor, want, { revealContacts });
      rows.push(...result.rows.slice(0, want));
      if (rows.length > config.maxRows) throw new LeadExportError('LEADS_EXPORT_TOO_LARGE');
      if (result.nextCursor === null) return rows;
      const stuck = result.rows.length === 0 || result.nextCursor === cursor;
      if (stuck || page > config.maxRows) throw new LeadExportError('LEADS_EXPORT_SOURCE_FAILED');
      cursor = result.nextCursor;
    }
  } catch (error) {
    if (error instanceof LeadExportError) throw error;
    throw new LeadExportError('LEADS_EXPORT_SOURCE_FAILED');
  }
}

function table(rows: LeadExportRow[], mode: LeadExportPhoneMode): string[][] {
  const columns = columnsFor(mode);
  return [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => sanitizeExportText(c.value(row, mode)))),
  ];
}

/** Ô CSV theo RFC 4180 (đã qua `sanitizeExportText`). */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function toCsv(cells: string[][]): Uint8Array {
  const body = cells.map((line) => line.map(csvField).join(',')).join('\r\n');
  return strToU8(`﻿${body}\r\n`);
}

const xmlEscape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function columnLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** XLSX tối giản: một trang tính, mọi ô là chuỗi dòng (`inlineStr`) nên không bao giờ là công thức. */
function toXlsx(cells: string[][]): Uint8Array {
  const rows = cells
    .map((line, r) => {
      const cs = line
        .map(
          (value, c) =>
            `<c r="${columnLetter(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`,
        )
        .join('');
      return `<row r="${r + 1}">${cs}</row>`;
    })
    .join('');
  const xml = (inner: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${inner}`;
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const pkg = 'http://schemas.openxmlformats.org/package/2006/relationships';
  return zipSync({
    '[Content_Types].xml': strToU8(
      xml(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '</Types>',
      ),
    ),
    '_rels/.rels': strToU8(
      xml(
        `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    ),
    'xl/workbook.xml': strToU8(
      xml(
        `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      xml(
        `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      xml(`<worksheet xmlns="${ns}"><sheetData>${rows}</sheetData></worksheet>`),
    ),
  });
}

const MIME: Record<LeadExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const datestamp = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');

/** Xuất khách tiềm năng. Lỗi: `LeadExportError` với mã cố định (không chứa dữ liệu khách). */
export async function exportLeads(request: LeadExportRequest): Promise<LeadExportResult> {
  if (!request.config.enabled) throw new LeadExportError('LEADS_EXPORT_DISABLED');
  assertConfig(request.config);
  const mode = resolveMode(request);
  const rows = await collectRows(request, mode === 'full');
  const cells = table(rows, mode);
  const bytes = request.format === 'csv' ? toCsv(cells) : toXlsx(cells);
  if (bytes.byteLength > LEAD_EXPORT_MAX_BYTES) throw new LeadExportError('LEADS_EXPORT_TOO_LARGE');
  return {
    filename: `leads-${datestamp(request.now)}.${request.format}`,
    mimeType: MIME[request.format],
    bytes,
    rowCount: rows.length,
  };
}

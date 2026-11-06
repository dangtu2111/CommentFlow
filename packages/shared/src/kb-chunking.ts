import { AppError } from './errors';

/** Trần ký tự của một đoạn thường (FR-055). */
export const CHUNK_MAX_CHARS = 900;
/** FAQ giữ nguyên cặp Hỏi/Đáp nên được trần lớn hơn (FR-055). */
export const FAQ_CHUNK_MAX_CHARS = 2000;
/** Trần độ dài `context_header` (FR-130). */
export const HEADER_MAX_CHARS = 200;
/** Trang Cơ sở kiến thức báo trước khi đoạn sắp hết hạn (FR-131). */
export const EXPIRY_WARNING_DAYS = 3;

const HEADER_SEPARATOR = ' › ';
const DAY_MS = 86_400_000;

export type ChunkKind = 'faq' | 'policy' | 'product' | 'manual' | 'shop_profile';

/** Tài liệu nguồn đã chuẩn hóa, đầu vào của `chunkDocument`. */
export type ChunkDocument = {
  /** Khóa ổn định của tài liệu (ví dụ `faq:<id>`); `chunk_key` = `<key>#<thứ tự>`. */
  key: string;
  kind: ChunkKind;
  sourceTitle: string;
  section?: string | null;
  productName?: string | null;
  lang: 'vi' | 'en';
  text: string;
  productId?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
};

/** Một đoạn chưa có embedding/hash — ánh xạ vào cột `kb_chunks`. */
export type ChunkDraft = {
  chunkKey: string;
  content: string;
  contextHeader: string | null;
  lang: 'vi' | 'en';
  productId: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
};

export type Validity = { validFrom: Date | null; validUntil: Date | null };

function squeeze(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Tiêu đề ngữ cảnh "nguồn › mục › tên sản phẩm": bỏ phần rỗng, cắt đúng trần (FR-130). */
export function buildContextHeader(parts: ReadonlyArray<string | null | undefined>): string | null {
  const cleaned = parts.map((part) => squeeze(part ?? '')).filter((part) => part !== '');
  if (cleaned.length === 0) return null;
  return cleaned.join(HEADER_SEPARATOR).slice(0, HEADER_MAX_CHARS);
}

/** Văn bản đem đi lập chỉ mục (embedding + tsv): `header + "\n" + content` (docs/10 §3.4, FR-130). */
export function indexText(chunk: { contextHeader: string | null; content: string }): string {
  return chunk.contextHeader === null ? chunk.content : `${chunk.contextHeader}\n${chunk.content}`;
}

/** Cắt cứng theo số điểm mã (code point), không tách giữa cặp thay thế (emoji). */
function hardSlice(text: string, max: number): string[] {
  const points = Array.from(text);
  const pieces: string[] = [];
  for (let start = 0; start < points.length; start += max) {
    pieces.push(points.slice(start, start + max).join(''));
  }
  return pieces;
}

/** Gói các câu vào mảnh ≤ `max`; câu dài hơn trần bị cắt cứng. */
function splitParagraph(paragraph: string, max: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const sentence of paragraph.split(/(?<=[.!?…])\s+/)) {
    for (const part of hardSlice(sentence, max)) {
      if (current === '') current = part;
      else if (current.length + 1 + part.length <= max) current = `${current} ${part}`;
      else {
        pieces.push(current);
        current = part;
      }
    }
  }
  if (current !== '') pieces.push(current);
  return pieces;
}

/** Cắt văn bản theo đoạn văn (dòng trống) rồi theo câu; gộp đoạn nhỏ đến sát trần (FR-055). */
export function chunkText(text: string, maxChars: number): string[] {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  const units = paragraphs.flatMap((paragraph) =>
    paragraph.length <= maxChars ? [paragraph] : splitParagraph(paragraph, maxChars),
  );
  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    if (current === '') current = unit;
    else if (current.length + 2 + unit.length <= maxChars) current = `${current}\n\n${unit}`;
    else {
      chunks.push(current);
      current = unit;
    }
  }
  if (current !== '') chunks.push(current);
  return chunks;
}

/** Tài liệu → các đoạn nháp có `context_header`, `chunk_key` ổn định, hạn hiệu lực (FR-055, 130, 131). */
export function chunkDocument(doc: ChunkDocument): ChunkDraft[] {
  const max = doc.kind === 'faq' ? FAQ_CHUNK_MAX_CHARS : CHUNK_MAX_CHARS;
  const contextHeader = buildContextHeader([doc.sourceTitle, doc.section, doc.productName]);
  return chunkText(doc.text, max).map((content, index) => ({
    chunkKey: `${doc.key}#${index}`,
    content,
    contextHeader,
    lang: doc.lang,
    productId: doc.productId ?? null,
    validFrom: doc.validFrom ?? null,
    validUntil: doc.validUntil ?? null,
  }));
}

function toDate(value: Date | string | null | undefined, field: string): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('VALIDATION_FAILED', `${field} không phải ngày hợp lệ.`);
  }
  return date;
}

/** Kiểm hạn hiệu lực đầu vào: `valid_until` phải sau `valid_from` (khớp CHECK ở DB, FR-131). */
export function parseValidity(
  validFrom: Date | string | null | undefined,
  validUntil: Date | string | null | undefined,
): Validity {
  const from = toDate(validFrom, 'valid_from');
  const until = toDate(validUntil, 'valid_until');
  if (from !== null && until !== null && until.getTime() <= from.getTime()) {
    throw new AppError('VALIDATION_FAILED', 'valid_until phải sau valid_from.');
  }
  return { validFrom: from, validUntil: until };
}

/** Đoạn còn hiệu lực tại `now`: `valid_from <= now < valid_until` (cùng bộ lọc SQL, docs/10 §5). */
export function isChunkValidAt(validity: Validity, now: Date): boolean {
  const { validFrom, validUntil } = validity;
  if (validFrom !== null && validFrom.getTime() > now.getTime()) return false;
  return validUntil === null || validUntil.getTime() > now.getTime();
}

/** Còn hiệu lực nhưng hết hạn trong ≤ 3 ngày → trang Cơ sở kiến thức cảnh báo (FR-131). */
export function isExpiringSoon(validity: Validity, now: Date): boolean {
  const { validUntil } = validity;
  if (validUntil === null || !isChunkValidAt(validity, now)) return false;
  return validUntil.getTime() - now.getTime() <= EXPIRY_WARNING_DAYS * DAY_MS;
}

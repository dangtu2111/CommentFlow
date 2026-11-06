import { strFromU8, unzipSync } from 'fflate';
import {
  IMPORT_MAX_COLUMNS,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_UNZIPPED_BYTES,
  ImportFileError,
} from './limits';

const SHEET_NAME = /^xl\/worksheets\/sheet(\d+)\.xml$/;
const SHARED_STRINGS = 'xl/sharedStrings.xml';
/** Trần số chuỗi dùng chung: không thể có nhiều hơn số ô tối đa của bảng. */
const MAX_SHARED_STRINGS = (IMPORT_MAX_ROWS + 1) * IMPORT_MAX_COLUMNS;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const invalid = () => new ImportFileError('XLSX_INVALID');

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1]?.toLowerCase() === 'x' ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

type Element = { attrs: string; body: string };

const isTagBoundary = (char: string) => char === '>' || char === '/' || /\s/.test(char);

/**
 * Duyệt các phần tử `<tag …>…</tag>` / `<tag …/>` bằng `indexOf` TUYẾN TÍNH (không regex lười): file xlsx là dữ liệu
 * không tin cậy, regex kiểu `[\s\S]*?</tag>` chạy bình phương khi thiếu thẻ đóng (ReDoS). Thiếu `>` hoặc thẻ đóng →
 * `XLSX_INVALID` ngay. Không hỗ trợ lồng cùng tên (trang tính/chuỗi dùng chung không lồng `row`/`c`/`si`/`t`).
 */
function* elements(xml: string, tag: string): Generator<Element> {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let position = 0;
  for (;;) {
    const start = xml.indexOf(open, position);
    if (start === -1) return;
    const afterName = start + open.length;
    if (!isTagBoundary(xml.charAt(afterName))) {
      position = afterName;
      continue;
    }
    const tagEnd = xml.indexOf('>', afterName);
    if (tagEnd === -1) throw invalid();
    if (xml.charAt(tagEnd - 1) === '/') {
      yield { attrs: xml.slice(afterName, tagEnd - 1), body: '' };
      position = tagEnd + 1;
      continue;
    }
    const end = xml.indexOf(close, tagEnd + 1);
    if (end === -1) throw invalid();
    yield { attrs: xml.slice(afterName, tagEnd), body: xml.slice(tagEnd + 1, end) };
    position = end + close.length;
  }
}

/** Bỏ mọi phần tử `<tag>…</tag>` khỏi khối (tuyến tính). */
function withoutElements(block: string, tag: string): string {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let result = '';
  let position = 0;
  for (;;) {
    const start = block.indexOf(open, position);
    if (start === -1) return result + block.slice(position);
    const end = block.indexOf(close, start);
    if (end === -1) throw invalid();
    result += block.slice(position, start);
    position = end + close.length;
  }
}

/** Ghép mọi `<t>` trong một khối (bỏ chú âm `<rPh>`). */
function textOf(block: string): string {
  let result = '';
  for (const t of elements(withoutElements(block, 'rPh'), 't')) result += decodeXml(t.body);
  return result;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (xml === undefined) return [];
  const strings: string[] = [];
  for (const si of elements(xml, 'si')) {
    if (strings.length >= MAX_SHARED_STRINGS) throw invalid();
    strings.push(textOf(si.body));
  }
  return strings;
}

function attribute(attrs: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];
}

/** "AB12" → chỉ số cột 0-based của "AB" (27). */
function columnIndex(reference: string): number | undefined {
  const letters = /^([A-Z]+)\d*$/.exec(reference)?.[1];
  if (letters === undefined) return undefined;
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function firstElement(body: string, tag: string): Element | undefined {
  for (const element of elements(body, tag)) return element;
  return undefined;
}

/**
 * Giá trị một ô. Công thức (`<f>`) KHÔNG bao giờ dùng giá trị đã tính: trả về chuỗi bắt đầu bằng "=" để bước kiểm
 * từng dòng từ chối (Q-KBIX1, chống công thức/CSV injection).
 */
function cellValue(attrs: string, body: string, shared: string[]): string {
  const formula = firstElement(body, 'f');
  if (formula) return `=${decodeXml(formula.body)}`;
  const type = attribute(attrs, 't');
  if (type === 'inlineStr') return textOf(firstElement(body, 'is')?.body ?? '');
  const raw = firstElement(body, 'v')?.body;
  if (raw === undefined || type === 'e') return '';
  if (type === 's') return shared[Number(raw)] ?? '';
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  return decodeXml(raw);
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  let rowNumber = 0;
  let rowsSeen = 0;
  for (const row of elements(xml, 'row')) {
    rowsSeen += 1;
    if (rowsSeen > IMPORT_MAX_ROWS + 1) throw new ImportFileError('TOO_MANY_ROWS');
    const declared = Number(attribute(row.attrs, 'r'));
    rowNumber = Number.isInteger(declared) && declared > 0 ? declared : rowNumber + 1;
    if (rowNumber > IMPORT_MAX_ROWS + 1) throw new ImportFileError('TOO_MANY_ROWS');
    const cells: string[] = [];
    let column = -1;
    let cellsSeen = 0;
    for (const cell of elements(row.body, 'c')) {
      cellsSeen += 1;
      if (cellsSeen > IMPORT_MAX_COLUMNS) throw new ImportFileError('TOO_MANY_COLUMNS');
      column = columnIndex(attribute(cell.attrs, 'r') ?? '') ?? column + 1;
      if (column >= IMPORT_MAX_COLUMNS) throw new ImportFileError('TOO_MANY_COLUMNS');
      while (cells.length < column) cells.push('');
      cells[column] = cellValue(cell.attrs, cell.body, shared);
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  }
  return rows;
}

/** Trang tính cần đọc: `sheet1` nếu có, không thì số nhỏ nhất. */
function pickSheet(names: string[]): string | undefined {
  const sheets = names
    .map((name) => ({ name, order: Number(SHEET_NAME.exec(name)?.[1]) }))
    .filter((sheet) => Number.isFinite(sheet.order))
    .sort((a, b) => a.order - b.order);
  return sheets[0]?.name;
}

/**
 * Đọc trang tính đầu của file `.xlsx` thành bảng chuỗi (không chạy macro/công thức, không đọc liên kết ngoài).
 * An toàn với file không tin cậy: kiểm TỔNG kích thước khai báo của các mục cần đọc trước khi giải nén (chặn zip bomb;
 * fflate giải nén vào bộ đệm đúng cỡ khai báo nên khai man cũng không vượt), quét XML tuyến tính (không regex lười),
 * giới hạn dòng/cột/chuỗi, mọi lỗi → `XLSX_INVALID`.
 */
export function readXlsx(bytes: Uint8Array): string[][] {
  try {
    const names: string[] = [];
    let declaredTotal = 0;
    unzipSync(bytes, {
      filter: (info) => {
        names.push(info.name);
        if (SHEET_NAME.test(info.name) || info.name === SHARED_STRINGS) {
          declaredTotal += info.originalSize;
          if (declaredTotal > IMPORT_MAX_UNZIPPED_BYTES) {
            throw new ImportFileError('XLSX_TOO_LARGE_UNZIPPED');
          }
        }
        return false;
      },
    });
    const sheetName = pickSheet(names);
    if (sheetName === undefined) throw invalid();
    const files = unzipSync(bytes, {
      filter: (info) => info.name === sheetName || info.name === SHARED_STRINGS,
    });
    const sheetBytes = files[sheetName] ?? new Uint8Array();
    const sharedBytes = files[SHARED_STRINGS];
    return parseSheet(
      strFromU8(sheetBytes),
      parseSharedStrings(sharedBytes === undefined ? undefined : strFromU8(sharedBytes)),
    );
  } catch (error) {
    if (error instanceof ImportFileError) throw error;
    throw invalid();
  }
}

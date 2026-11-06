import { strFromU8, unzipSync } from 'fflate';
import {
  IMPORT_MAX_COLUMNS,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_UNZIPPED_BYTES,
  ImportFileError,
} from './limits';

const SHEET_NAME = /^xl\/worksheets\/sheet(\d+)\.xml$/;
const SHARED_STRINGS = 'xl/sharedStrings.xml';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

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

/** Ghép mọi `<t>` trong một khối (bỏ chú âm `<rPh>`); `<t/>` rỗng không khớp nên không nuốt chữ sau nó. */
function textOf(block: string): string {
  const withoutPhonetic = block.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let result = '';
  for (const match of withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    result += decodeXml(match[1] ?? '');
  }
  return result;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (xml === undefined) return [];
  return [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textOf(m[1] ?? ''));
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

/**
 * Giá trị một ô. Công thức (`<f>`) KHÔNG bao giờ dùng giá trị đã tính: trả về chuỗi bắt đầu bằng "=" để bước kiểm
 * từng dòng từ chối (Q-KBIX1, chống công thức/CSV injection).
 */
function cellValue(attrs: string, body: string, shared: string[]): string {
  const formula = /<f\b(?:[^>]*?\/>|[^>]*>([\s\S]*?)<\/f>)/.exec(body);
  if (formula) return `=${decodeXml(formula[1] ?? '')}`;
  const type = attribute(attrs, 't');
  if (type === 'inlineStr') return textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
  const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
  if (raw === undefined || type === 'e') return '';
  if (type === 's') return shared[Number(raw)] ?? '';
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  return decodeXml(raw);
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  let rowNumber = 0;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const declared = Number(attribute(rowMatch[1] ?? '', 'r'));
    rowNumber = Number.isInteger(declared) && declared > 0 ? declared : rowNumber + 1;
    if (rowNumber > IMPORT_MAX_ROWS + 1) throw new ImportFileError('TOO_MANY_ROWS');
    const cells: string[] = [];
    let column = -1;
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1] ?? '';
      column = columnIndex(attribute(attrs, 'r') ?? '') ?? column + 1;
      if (column >= IMPORT_MAX_COLUMNS) throw new ImportFileError('TOO_MANY_COLUMNS');
      while (cells.length < column) cells.push('');
      cells[column] = cellValue(attrs, cellMatch[2] ?? '', shared);
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
 * An toàn với file không tin cậy: kiểm kích thước KHAI BÁO của từng mục trước khi giải nén (chặn zip bomb; fflate
 * giải nén vào bộ đệm đúng cỡ khai báo nên khai man cũng không vượt), giới hạn dòng/cột, mọi lỗi → `XLSX_INVALID`.
 */
export function readXlsx(bytes: Uint8Array): string[][] {
  try {
    const names: string[] = [];
    unzipSync(bytes, {
      filter: (info) => {
        names.push(info.name);
        if (
          (SHEET_NAME.test(info.name) || info.name === SHARED_STRINGS) &&
          info.originalSize > IMPORT_MAX_UNZIPPED_BYTES
        ) {
          throw new ImportFileError('XLSX_TOO_LARGE_UNZIPPED');
        }
        return false;
      },
    });
    const sheetName = pickSheet(names);
    if (sheetName === undefined) throw new ImportFileError('XLSX_INVALID');
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
    throw new ImportFileError('XLSX_INVALID');
  }
}

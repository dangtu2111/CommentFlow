import { IMPORT_MAX_COLUMNS, IMPORT_MAX_ROWS, ImportFileError } from './limits';

const DELIMITERS = [',', ';', '\t'] as const;

/** Dấu phân cách theo dòng đầu (bỏ qua phần trong ngoặc kép); hòa hoặc không có → dấu phẩy. */
function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === '\n' || char === '\r')) break;
    else if (!inQuotes && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best = ',';
  let bestCount = 0;
  for (const [delimiter, count] of counts) {
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Đọc CSV theo RFC 4180 (ngoặc kép, ngoặc kép lồng `""`, xuống dòng trong ô), tự nhận `,` `;` tab, bỏ BOM.
 * Không thực thi/diễn giải gì: mọi ô là chuỗi. Quá `IMPORT_MAX_ROWS` dòng dữ liệu hoặc `IMPORT_MAX_COLUMNS` cột → lỗi.
 * Dòng trống ở giữa được giữ (để số dòng báo lỗi khớp file); dòng trống ở cuối bị bỏ.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let hasContent = false;

  const endField = () => {
    row.push(field);
    field = '';
    if (row.length > IMPORT_MAX_COLUMNS) throw new ImportFileError('TOO_MANY_COLUMNS');
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    hasContent = false;
    if (rows.length > IMPORT_MAX_ROWS + 1) throw new ImportFileError('TOO_MANY_ROWS');
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (inQuotes) {
      if (char === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += char;
    } else if (char === '"') {
      inQuotes = true;
      hasContent = true;
    } else if (char === delimiter) {
      endField();
      hasContent = true;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text.charAt(i + 1) === '\n') i += 1;
      endRow();
    } else {
      field += char;
      hasContent = true;
    }
  }
  if (hasContent || field !== '' || row.length > 0) endRow();

  while (
    rows.length > 0 &&
    rows[rows.length - 1]?.length === 1 &&
    rows[rows.length - 1]?.[0] === ''
  ) {
    rows.pop();
  }
  return rows;
}

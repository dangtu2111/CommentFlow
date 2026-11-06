import { foldText, normalizeAttrs } from '../products';
import { IMPORT_MAX_CELL_CHARS } from './limits';
import type { ColumnMapping, ColumnTarget } from './mapping';

export type ImportRowErrorCode =
  | 'NAME_REQUIRED'
  | 'PRICE_INVALID'
  | 'COMPARE_AT_INVALID'
  | 'STOCK_INVALID'
  | 'FORMULA_BLOCKED'
  | 'CELL_TOO_LONG'
  | 'URL_INVALID'
  | 'DUPLICATE_VARIANT';

/** `row` = số dòng trong file (tiêu đề là dòng 1); `column` = chỉ số cột 0-based, `null` nếu lỗi của cả dòng. */
export type ImportRowError = { row: number; column: number | null; code: ImportRowErrorCode };

/** Một dòng hợp lệ = một biến thể của một sản phẩm. */
export type ImportRecord = {
  row: number;
  productKey: string;
  productName: string;
  productCode: string | null;
  category: string | null;
  url: string | null;
  sku: string | null;
  attrs: Record<string, string>;
  priceVnd: number | null;
  compareAtVnd: number | null;
  stock: number | null;
};

export type ImportValidation = {
  records: ImportRecord[];
  errors: ImportRowError[];
  /** Số dòng dữ liệu không trống (kể cả dòng lỗi). */
  totalRows: number;
};

const MAX_VND = 1_000_000_000_000;
const MAX_STOCK = 2_147_483_647;

/**
 * Số tiền VND từ ô (Q-KBIX1): `150000`, `150.000`, `150,000`, `150000đ`, `VND 150000`, `150000.00`. Rỗng → `null`;
 * mọi dạng khác (âm, chữ, thập phân thật, hàng nghìn sai chỗ) → `'invalid'` — không đoán.
 */
export function parseVndAmount(raw: string): number | null | 'invalid' {
  if (raw.trim() === '') return null;
  const compact = foldText(raw.replace(/₫/g, 'đ'))
    .replace(/\s/g, '')
    .replace(/^(vnd|d)|(vnd|d)$/g, '');
  let digits: string;
  if (/^\d+$/.test(compact)) digits = compact;
  else if (/^\d{1,3}([.,]\d{3})+$/.test(compact)) digits = compact.replace(/[.,]/g, '');
  else if (/^\d+[.,]0+$/.test(compact)) digits = compact.replace(/[.,]0+$/, '');
  else return 'invalid';
  const value = Number(digits);
  return value > MAX_VND ? 'invalid' : value;
}

/** Tồn kho: số nguyên không âm (`12`, `12.0`). Rỗng → `null`. */
export function parseStock(raw: string): number | null | 'invalid' {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^\d+(\.0+)?$/.test(text)) return 'invalid';
  const value = Number(text.replace(/\.0+$/, ''));
  return value > MAX_STOCK ? 'invalid' : value;
}

/**
 * Ô trông như công thức (OWASP CSV injection): bắt đầu bằng `=` hoặc `@`, hoặc `+`/`-` theo sau bởi thứ không phải
 * số thuần. `-` đứng một mình và số âm thuần không bị coi là công thức (số âm sẽ bị chặn ở bước kiểm giá/tồn).
 */
function looksLikeFormula(text: string): boolean {
  if (text.startsWith('=') || text.startsWith('@')) return true;
  return /^[+-]./.test(text) && !/^[+-]\d+([.,]\d+)?$/.test(text);
}

/** Link sản phẩm: chỉ `http:`/`https:` (chặn `javascript:`, `data:`, `file:`…); độ dài đã bị giới hạn bởi trần ô. */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

type Cell = { index: number; target: ColumnTarget; header: string; text: string };

const text = (cell: Cell | undefined): string | null =>
  cell === undefined || cell.text === '' ? null : cell.text;

/**
 * Kiểm từng dòng dữ liệu (dòng 0 của `table` là tiêu đề). Dòng có BẤT KỲ lỗi nào bị loại khỏi `records` và liệt kê
 * trong `errors` (nhiều lỗi/dòng được báo hết); dòng hợp lệ vẫn nhập được (Q-KBIX1 f). Ô của cột "bỏ qua" không bị kiểm.
 * Hàm thuần: không đụng DB.
 */
export function validateImportTable(
  table: readonly (readonly string[])[],
  mapping: ColumnMapping,
): ImportValidation {
  const header = table[0] ?? [];
  const records: ImportRecord[] = [];
  const errors: ImportRowError[] = [];
  const seenVariants = new Set<string>();
  let totalRows = 0;

  for (let r = 1; r < table.length; r += 1) {
    const source = table[r] ?? [];
    if (source.every((value) => value.trim() === '')) continue;
    totalRows += 1;
    const row = r + 1;
    const rowErrors: ImportRowError[] = [];
    const fail = (column: number | null, code: ImportRowErrorCode) =>
      rowErrors.push({ row, column, code });

    const cells: Cell[] = [];
    mapping.forEach((target, index) => {
      if (target === 'ignore') return;
      const value = (source[index] ?? '').trim();
      if (value.length > IMPORT_MAX_CELL_CHARS) {
        fail(index, 'CELL_TOO_LONG');
        return;
      }
      if (looksLikeFormula(value)) {
        fail(index, 'FORMULA_BLOCKED');
        return;
      }
      const headerText = (header[index] ?? '').trim();
      // Tiêu đề cột thuộc tính thành KHÓA của `attrs`: cùng luật chống công thức/độ dài như ô dữ liệu.
      if (target === 'attribute' && value !== '' && headerText.length > IMPORT_MAX_CELL_CHARS) {
        fail(index, 'CELL_TOO_LONG');
        return;
      }
      if (target === 'attribute' && value !== '' && looksLikeFormula(headerText)) {
        fail(index, 'FORMULA_BLOCKED');
        return;
      }
      cells.push({ index, target, header: headerText, text: value });
    });
    const byTarget = (target: ColumnTarget) => cells.find((cell) => cell.target === target);

    const nameCell = byTarget('productName');
    const productName = text(nameCell);
    const nameBlocked = rowErrors.some((e) => e.column === mapping.indexOf('productName'));
    if (productName === null && !nameBlocked) fail(mapping.indexOf('productName'), 'NAME_REQUIRED');

    const amount = (target: 'price' | 'compareAtPrice', code: ImportRowErrorCode) => {
      const cell = byTarget(target);
      const value = parseVndAmount(cell?.text ?? '');
      if (value === 'invalid') fail(cell?.index ?? null, code);
      return value === 'invalid' ? null : value;
    };
    const priceVnd = amount('price', 'PRICE_INVALID');
    const compareAtVnd = amount('compareAtPrice', 'COMPARE_AT_INVALID');
    const stockCell = byTarget('stock');
    const stockValue = parseStock(stockCell?.text ?? '');
    if (stockValue === 'invalid') fail(stockCell?.index ?? null, 'STOCK_INVALID');

    const attrs: Record<string, string> = {};
    for (const cell of cells) {
      if (cell.target === 'attribute' && cell.header !== '' && cell.text !== '') {
        attrs[cell.header] = cell.text;
      }
    }
    const urlCell = byTarget('url');
    const url = text(urlCell);
    if (url !== null && !isHttpUrl(url)) fail(urlCell?.index ?? null, 'URL_INVALID');
    const sku = text(byTarget('sku'));
    const productCode = text(byTarget('productCode'));

    if (rowErrors.length === 0 && productName !== null) {
      const productKey = foldText(productCode ?? productName);
      const attrSignature = JSON.stringify(Object.entries(normalizeAttrs(attrs)).sort());
      const variantKey = `${productKey}\u0000${sku === null ? `attrs:${attrSignature}` : `sku:${foldText(sku)}`}`;
      if (seenVariants.has(variantKey)) {
        fail(sku === null ? null : (byTarget('sku')?.index ?? null), 'DUPLICATE_VARIANT');
      } else {
        seenVariants.add(variantKey);
        records.push({
          row,
          productKey,
          productName,
          productCode,
          category: text(byTarget('category')),
          url,
          sku,
          attrs,
          priceVnd: priceVnd as number | null,
          compareAtVnd: compareAtVnd as number | null,
          stock: stockValue as number | null,
        });
      }
    }
    errors.push(...rowErrors);
  }
  return { records, errors, totalRows };
}

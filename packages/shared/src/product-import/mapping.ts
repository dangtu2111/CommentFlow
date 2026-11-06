import { z } from 'zod';
import { foldText } from '../products';
import { IMPORT_MAX_COLUMNS } from './limits';

/** Trường sản phẩm/biến thể mà một cột có thể khớp vào (FR-051). */
export const IMPORT_FIELDS = [
  'productName',
  'productCode',
  'sku',
  'price',
  'compareAtPrice',
  'stock',
  'category',
  'url',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Đích của một cột: một trường, thuộc tính biến thể (màu/size…, khóa = tiêu đề cột), hoặc bỏ qua. */
export type ColumnTarget = ImportField | 'attribute' | 'ignore';
export type ColumnMapping = readonly ColumnTarget[];

export const columnMappingSchema = z
  .array(z.enum([...IMPORT_FIELDS, 'attribute', 'ignore']))
  .max(IMPORT_MAX_COLUMNS);

// Tiêu đề đã `foldText` (bỏ dấu, thường). Mở rộng khi gặp file thật cho thấy thiếu.
const ALIASES: Record<ColumnTarget, readonly string[]> = {
  productName: ['ten', 'ten san pham', 'san pham', 'product', 'product name', 'name', 'title'],
  productCode: ['ma sp', 'ma san pham', 'product code', 'product id', 'id san pham'],
  sku: ['sku', 'ma hang', 'ma bien the', 'variant sku'],
  price: ['gia', 'gia ban', 'gia ban le', 'don gia', 'price'],
  compareAtPrice: ['gia goc', 'gia so sanh', 'compare at price', 'compare price', 'original price'],
  stock: ['ton', 'ton kho', 'so luong', 'stock', 'inventory', 'quantity', 'qty'],
  category: ['danh muc', 'loai', 'nhom hang', 'category'],
  url: ['link', 'url', 'duong dan', 'link san pham'],
  attribute: ['mau', 'mau sac', 'color', 'colour', 'size', 'kich co', 'kich thuoc'],
  ignore: [],
};

const FIELD_BY_ALIAS = new Map<string, ColumnTarget>();
for (const [target, aliases] of Object.entries(ALIASES) as [ColumnTarget, readonly string[]][]) {
  for (const alias of aliases) FIELD_BY_ALIAS.set(alias, target);
}

/**
 * Gợi ý khớp cột từ hàng tiêu đề. Mỗi trường (trừ `attribute`) chỉ gán cho MỘT cột — cột đầu tiên thắng, các cột
 * trùng sau đó bỏ qua; tiêu đề lạ → `ignore`. Người dùng sửa lại ở bước khớp cột.
 */
export function suggestMapping(headers: readonly string[]): ColumnTarget[] {
  const used = new Set<ColumnTarget>();
  return headers.map((header) => {
    const target = FIELD_BY_ALIAS.get(foldText(header)) ?? 'ignore';
    if (target === 'ignore') return 'ignore';
    if (target !== 'attribute') {
      if (used.has(target)) return 'ignore';
      used.add(target);
    }
    return target;
  });
}

export type MappingCheck =
  | { ok: true }
  | { ok: false; code: 'LENGTH_MISMATCH' | 'NAME_COLUMN_REQUIRED' | 'DUPLICATE_FIELD' };

/** Khớp cột hợp lệ: đúng số cột, có cột tên sản phẩm, mỗi trường tối đa một cột. */
export function checkMapping(mapping: ColumnMapping, headerCount: number): MappingCheck {
  if (mapping.length !== headerCount) return { ok: false, code: 'LENGTH_MISMATCH' };
  if (!mapping.includes('productName')) return { ok: false, code: 'NAME_COLUMN_REQUIRED' };
  const fields = mapping.filter((target) => target !== 'attribute' && target !== 'ignore');
  if (new Set(fields).size !== fields.length) return { ok: false, code: 'DUPLICATE_FIELD' };
  return { ok: true };
}

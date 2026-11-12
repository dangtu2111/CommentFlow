/**
 * Phần THUẦN của hộp thoại "Chọn Fanpage kết nối" (design/stitch "Select Channel Modal"): lọc danh sách, trạng thái từng dòng, hạn mức kênh. Không phụ thuộc React/DB.
 */
export type SelectablePage = { id: string; name: string; connected: boolean; usable: boolean };

const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/** Tìm theo tên (không phân biệt hoa/thường và dấu) hoặc theo ID; từ khóa rỗng → tất cả. */
export function filterPages<T extends SelectablePage>(pages: readonly T[], query: string): T[] {
  const q = fold(query.trim());
  if (q === '') return [...pages];
  return pages.filter((page) => fold(page.name).includes(q) || page.id.includes(q));
}

export type RowState = 'selectable' | 'connected' | 'blocked';

/** `connected`: đã kết nối ở workspace này (khóa); `blocked`: tài khoản không có vai trò quản lý/kiểm duyệt Page; còn lại chọn được. */
export function rowState(page: SelectablePage): RowState {
  if (page.connected) return 'connected';
  return page.usable ? 'selectable' : 'blocked';
}

export function selectionState(input: {
  selected: readonly string[];
  used: number;
  limit: number;
}): {
  count: number;
  remaining: number;
  overLimit: boolean;
  canSubmit: boolean;
} {
  const count = new Set(input.selected).size;
  const remaining = Math.max(0, input.limit - input.used - count);
  const overLimit = input.used + count > input.limit;
  return { count, remaining, overLimit, canSubmit: count > 0 && !overLimit };
}

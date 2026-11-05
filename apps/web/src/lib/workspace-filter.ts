/** Chuẩn hóa để so khớp: bỏ dấu tiếng Việt (kể cả đ/Đ), hạ chữ thường, cắt khoảng trắng hai đầu. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

/** Lọc workspace theo tên (FR-005): chứa chuỗi tìm, không phân biệt hoa/thường và dấu; ô trống → giữ nguyên. */
export function filterWorkspacesByName<T extends { name: string }>(items: T[], query: string): T[] {
  const needle = fold(query);
  if (needle === '') return items;
  return items.filter((item) => fold(item.name).includes(needle));
}

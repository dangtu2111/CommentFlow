import type { ReactNode } from 'react';

const END_CLASS = 'data-table-end';

/** `end`: cột số/hành động căn phải. Nhãn cột là khóa React (mỗi cột một nhãn riêng). */
export type DataTableColumn = { label: string; end?: boolean };

/**
 * Bảng dữ liệu (Nhật ký, Báo cáo): khung cuộn ngang trên màn nhỏ + hàng tiêu đề. Trang truyền các `<tr>`;
 * ô của cột `end` dùng `className="data-table-end"`.
 */
export function DataTable({
  label,
  columns,
  children,
}: {
  label: string;
  columns: readonly DataTableColumn[];
  children: ReactNode;
}) {
  return (
    <div className="data-table-wrap">
      <table className="data-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.label} scope="col" className={col.end ? END_CLASS : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

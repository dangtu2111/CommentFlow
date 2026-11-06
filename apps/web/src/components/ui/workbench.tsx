import type { ReactNode } from 'react';

/**
 * Bàn làm việc nhiều cột cao bằng màn hình (Bình luận; dùng lại cho Tin nhắn): dải phụ + các cột cuộn riêng.
 * `pane` chỉ có tác dụng ở mobile (<900px): hiện danh sách HOẶC chi tiết. Trang chỉ truyền nội dung từng cột.
 */
export function Workbench({
  strip,
  pane,
  className,
  children,
}: {
  strip?: ReactNode;
  pane?: 'list' | 'detail';
  className?: string;
  children: ReactNode;
}) {
  return (
    <main className={['wb', className ?? ''].filter(Boolean).join(' ')} data-pane={pane}>
      {strip}
      <div className="wb-body">{children}</div>
    </main>
  );
}

/** Dải phụ cao 44px phía trên các cột (tiêu đề + gợi ý thao tác). */
export function WorkbenchStrip({ children }: { children: ReactNode }) {
  return <div className="wb-strip">{children}</div>;
}

type PaneProps = { label?: string; children: ReactNode };

/** Cột lọc/trạng thái (224px); bên trong tự có `<nav>` của nó. */
export function WorkbenchFilters({ children }: Pick<PaneProps, 'children'>) {
  return <div className="wb-pane wb-pane-filters">{children}</div>;
}

/** Cột danh sách (384px). */
export function WorkbenchList({ label, children }: PaneProps) {
  return (
    <section className="wb-pane wb-pane-list" aria-label={label}>
      {children}
    </section>
  );
}

/** Cột chi tiết (co giãn, thẻ `<aside>`). */
export function WorkbenchDetail({ label, children }: PaneProps) {
  return (
    <aside className="wb-pane wb-pane-detail" aria-label={label}>
      {children}
    </aside>
  );
}

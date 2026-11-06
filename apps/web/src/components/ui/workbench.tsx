import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Bàn làm việc nhiều cột cao bằng màn hình (Bình luận; dùng lại cho Tin nhắn): dải phụ + các cột cuộn riêng.
 * Class Tailwind chép từ `design/stitch/comments.html` (ADR 013); bọc `.tw` để tiện ích có hiệu lực.
 * `pane` chỉ có tác dụng ở mobile (<900px): hiện danh sách HOẶC chi tiết (qua `group-data-[pane=…]/wb`).
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
    <div className="tw">
      <main
        className={cn(
          'group/wb flex min-w-0 flex-col bg-background min-[900px]:h-[calc(100vh-4rem)] min-[900px]:overflow-hidden',
          className,
        )}
        data-pane={pane}
      >
        {strip}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background min-[900px]:flex-row">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Dải phụ cao 44px phía trên các cột (tiêu đề + gợi ý thao tác). Ẩn ở mobile khi đang xem chi tiết. */
export function WorkbenchStrip({ children }: { children: ReactNode }) {
  return (
    <div className="z-20 flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-surface-container-lowest px-4 shadow-sm group-data-[pane=detail]/wb:max-[899px]:hidden">
      {children}
    </div>
  );
}

type PaneProps = { label?: string; children: ReactNode };

/** Cột lọc/trạng thái (224px); bên trong tự có `<nav>` của nó. */
export function WorkbenchFilters({ children }: Pick<PaneProps, 'children'>) {
  return (
    <div className="flex min-w-0 flex-col justify-between bg-surface-container-lowest group-data-[pane=detail]/wb:max-[899px]:hidden min-[900px]:min-h-0 min-[900px]:w-56 min-[900px]:shrink-0 min-[900px]:overflow-y-auto">
      {children}
    </div>
  );
}

/** Cột danh sách (384px; 320px ở 900–1099px). */
export function WorkbenchList({ label, children }: PaneProps) {
  return (
    <section
      className="flex min-w-0 flex-col bg-surface-container-low group-data-[pane=detail]/wb:max-[899px]:hidden min-[900px]:min-h-0 min-[900px]:w-80 min-[900px]:shrink-0 min-[900px]:overflow-hidden min-[1100px]:w-96"
      aria-label={label}
    >
      {children}
    </section>
  );
}

/** Cột chi tiết (co giãn, thẻ `<aside>`). */
export function WorkbenchDetail({ label, children }: PaneProps) {
  return (
    <aside
      className="flex min-w-0 flex-col bg-surface-container-lowest group-data-[pane=list]/wb:max-[899px]:hidden min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:overflow-y-auto"
      aria-label={label}
    >
      {children}
    </aside>
  );
}

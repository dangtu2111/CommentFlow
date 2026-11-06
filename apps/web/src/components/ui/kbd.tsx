import type { ReactNode } from 'react';

/** Ô phím tắt nhỏ (ví dụ `Ctrl + Enter`). Chỉ gợi ý; hành vi do trình xử lý phím của từng màn. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

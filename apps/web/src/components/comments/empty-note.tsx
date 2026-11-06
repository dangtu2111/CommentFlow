import Link from 'next/link';
import type { ReactNode } from 'react';

/** Trạng thái rỗng/lỗi trong cột danh sách hoặc chi tiết (hộp thư Bình luận). */
export function EmptyNote({ title, body, role }: { title: string; body: string; role?: 'alert' }) {
  return (
    <div className="p-6 text-center" role={role}>
      <h2 className="font-title-md text-title-md text-on-surface">{title}</h2>
      <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{body}</p>
    </div>
  );
}

/** Liên kết "← Danh sách" chỉ hiện ở mobile (<900px) khi đang xem chi tiết. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="block bg-surface-container-lowest px-5 py-3 font-title-sm text-title-sm text-primary min-[900px]:hidden"
    >
      {children}
    </Link>
  );
}

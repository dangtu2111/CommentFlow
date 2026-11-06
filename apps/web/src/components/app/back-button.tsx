'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

/** Nút "Quay lại trang trước" của trang 404 (cần JS của trình duyệt để lùi lịch sử). */
export function BackButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
      <ArrowLeft size={18} aria-hidden="true" />
      {label}
    </button>
  );
}

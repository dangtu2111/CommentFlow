'use client';

import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** Nút gửi form: khóa và hiện vòng xoay khi Server Action đang chạy (chống bấm đúp). */
export function SubmitButton({
  children,
  variant = 'primary',
  block = true,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger-ghost';
  block?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`btn btn-${variant}${block ? ' btn-block' : ''}`}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

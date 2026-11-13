'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Nút gửi biểu mẫu chống BẤM ĐÚP (Biên tập bài viết, Lịch đăng): ngay khi biểu mẫu đang gửi, MỌI nút thuộc biểu mẫu đó bị khóa (không gửi lần hai); nút vừa bấm hiện nhãn "đang gửi".
 * Đăng bài lên Facebook không thu hồi được nên không để một lần bấm thành hai lệnh. Chỉ dùng BÊN TRONG `<form>`.
 */
export function PendingSubmit({
  children,
  pendingLabel,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  children: ReactNode;
  /** Nhãn khi chính nút này đang gửi (nút nhận biết qua `name="intent"` + `value`). */
  pendingLabel?: string;
}) {
  const { pending, data } = useFormStatus();
  const mine = pending && rest.name !== undefined && data?.get(rest.name) === rest.value;
  return (
    <button
      type="submit"
      {...rest}
      disabled={pending || rest.disabled}
      aria-disabled={pending || rest.disabled}
      aria-busy={mine || undefined}
      className={`${className ?? ''}${pending ? ' cursor-wait opacity-70' : ''}`}
    >
      {mine && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Dòng thông báo "đang gửi" cho người dùng (đọc được bằng trình đọc màn hình), chỉ hiện khi biểu mẫu đang gửi. */
export function PendingNote({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        pending
          ? 'rounded-lg bg-primary-fixed/50 p-space-sm font-body-sm text-body-sm text-on-surface'
          : 'sr-only'
      }
    >
      {pending ? children : null}
    </p>
  );
}

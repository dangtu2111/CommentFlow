import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'danger';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-container text-primary',
  success: 'bg-primary-fixed text-on-primary-fixed',
  danger: 'bg-error-container text-on-error-container',
};

/**
 * Khối "biểu tượng tròn + tiêu đề + mô tả (+ nội dung)" của các trang kết quả trong khung xác thực:
 * kiểm tra email, xác minh email, lời mời không dùng được. Một nơi duy nhất, trang không tự dựng lại.
 * Dựng bằng Tailwind (chỉ chạy trong khung `.tw` của `AuthShell`).
 */
export function AuthStatus({
  icon: Icon,
  tone = 'neutral',
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-space-md text-center">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full ${TONE_CLASS[tone]}`}
        aria-hidden="true"
      >
        <Icon size={28} />
      </span>
      <h1 className="font-headline-md text-headline-md text-on-surface">{title}</h1>
      {description ? (
        <p className="font-body-md text-body-md text-on-surface-variant">{description}</p>
      ) : null}
      {children}
    </div>
  );
}

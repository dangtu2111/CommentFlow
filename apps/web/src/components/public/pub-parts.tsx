import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Mảnh dùng chung cho trang công khai mẫu (Landing, Quyền riêng tư, Điều khoản). Chữ "[MẪU]" viết thẳng (trang dev). */

const SOON = 'Sắp có';

/** Liên kết CHƯA có đích: hiển thị đúng thiết kế nhưng vô hiệu kèm chú thích "Sắp có". */
export function SoonLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      aria-disabled="true"
      title={SOON}
      className={cn('cursor-not-allowed opacity-70', className)}
    >
      {children}
    </span>
  );
}

const PILL_TONES = {
  primary: 'bg-primary-fixed text-on-primary-fixed',
  secondary: 'bg-secondary-fixed text-on-secondary-fixed',
} as const;

/** Đầu mục giữa trang: viên thuốc + tiêu đề + mô tả (lặp ở Giá trị cốt lõi, Kiến trúc, Bảng giá, FAQ). */
export function SectionHead({
  pill,
  title,
  body,
  tone = 'primary',
  className,
}: {
  pill: string;
  title: string;
  body: string;
  tone?: keyof typeof PILL_TONES;
  className?: string;
}) {
  return (
    <div className={cn('text-center max-w-3xl mx-auto mb-space-xl', className)}>
      <span
        className={cn(
          'px-space-md py-1 rounded-full font-label-sm text-label-sm uppercase font-bold tracking-wider',
          PILL_TONES[tone],
        )}
      >
        {pill}
      </span>
      <h2 className="font-headline-lg text-headline-lg text-on-surface mt-space-sm mb-space-xs font-bold">
        {title}
      </h2>
      <p className="font-body-lg text-body-lg text-on-surface-variant">{body}</p>
    </div>
  );
}

/** Đoạn văn bản pháp lý. */
export function LegalNote({ children }: { children: ReactNode }) {
  return (
    <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{children}</p>
  );
}

/** Ghi chú trung thực cho nội dung pháp lý/số liệu chưa có thật. */
export const PENDING_LEGAL = '[MẪU] Nội dung chờ duyệt pháp lý.';

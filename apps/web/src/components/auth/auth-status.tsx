import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'danger';

/**
 * Khối "biểu tượng tròn + tiêu đề + mô tả (+ nội dung)" của các trang kết quả trong khung xác thực:
 * kiểm tra email, xác minh email, lời mời hợp lệ/không dùng được. Một nơi duy nhất, trang không tự dựng lại.
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
  const toneClass = tone === 'neutral' ? '' : ` auth-status-icon-${tone}`;
  return (
    <div className="auth-status">
      <span className={`auth-status-icon${toneClass}`} aria-hidden="true">
        <Icon size={28} />
      </span>
      <h1 className="auth-title">{title}</h1>
      {description ? <p className="auth-subtitle">{description}</p> : null}
      {children}
    </div>
  );
}

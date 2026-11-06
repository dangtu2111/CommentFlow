import type { ReactNode } from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';

/**
 * Ảnh đại diện tròn: chữ viết tắt hoặc biểu tượng (không dùng ảnh/logo thật). `ai` dùng màu AI;
 * `badge` là huy hiệu nhỏ ở góc dưới phải (ví dụ chữ viết tắt nền tảng "FB"/"IG").
 */
export function Avatar({
  size = 'md',
  ai = false,
  badge,
  children,
}: {
  size?: AvatarSize;
  ai?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const className = ['avatar', size === 'md' ? '' : `avatar-${size}`, ai ? 'avatar-ai' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={className} aria-hidden="true">
      {children}
      {badge ? <span className="avatar-badge">{badge}</span> : null}
    </span>
  );
}

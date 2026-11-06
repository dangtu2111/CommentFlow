import type { ReactNode } from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';

/** Ảnh đại diện tròn: chữ viết tắt hoặc biểu tượng (không dùng ảnh/logo thật). `ai` dùng màu AI. */
export function Avatar({
  size = 'md',
  ai = false,
  children,
}: {
  size?: AvatarSize;
  ai?: boolean;
  children: ReactNode;
}) {
  const className = ['avatar', size === 'md' ? '' : `avatar-${size}`, ai ? 'avatar-ai' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={className} aria-hidden="true">
      {children}
    </span>
  );
}

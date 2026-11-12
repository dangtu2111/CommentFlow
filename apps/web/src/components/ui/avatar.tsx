import type { ReactNode } from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';

/**
 * Ảnh đại diện tròn: chữ viết tắt hoặc biểu tượng; có `src` (URL `https` của nền tảng, ví dụ ảnh người bình luận) thì hiện ảnh thật, lỗi/không hợp lệ quay về
 * chữ viết tắt. `ai` dùng màu AI;
 * `badge` là huy hiệu nhỏ ở góc dưới phải (ví dụ chữ viết tắt nền tảng "FB"/"IG").
 */
/** Chỉ nhận URL `https` hợp lệ (dữ liệu nền tảng, không tin tuyệt đối); CSP `img-src` còn giới hạn tên miền cho phép. */
function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function Avatar({
  size = 'md',
  ai = false,
  badge,
  src,
  children,
}: {
  size?: AvatarSize;
  ai?: boolean;
  badge?: ReactNode;
  /** Ảnh thật của người dùng/khách (URL https); thiếu hoặc không hợp lệ → hiện `children`. */
  src?: string | null;
  children: ReactNode;
}) {
  const image = safeImageUrl(src);
  const className = ['avatar', size === 'md' ? '' : `avatar-${size}`, ai ? 'avatar-ai' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={className} aria-hidden="true">
      {image ? (
        // biome-ignore lint/performance/noImgElement: ảnh CDN của nền tảng (không qua next/image, tên miền do CSP kiểm soát)
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="avatar-img"
        />
      ) : (
        children
      )}
      {badge ? <span className="avatar-badge">{badge}</span> : null}
    </span>
  );
}

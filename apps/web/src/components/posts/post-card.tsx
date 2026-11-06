import type { ReactNode } from 'react';
import { Icon } from '../ui/icon';

/**
 * Thẻ một bài viết theo design/stitch/posts.html (trình bày thuần, dùng cho dữ liệu thật và mẫu dev).
 * Bài còn bình luận chờ có vạch nhấn màu chính ở mép trái. Ảnh bài chưa có trong truy vấn (`media_url`, gap
 * POSTS-LIST-LINK-FILTER) nên hiện khung trống; tiêu đề chỉ hiện khi có (bài thật chỉ có nội dung).
 * Chỉ dùng bên trong `.tw`.
 */
export function PostCard({
  pending,
  meta,
  badge,
  title,
  snippet,
  stats,
  footer,
}: {
  pending: boolean;
  meta: ReactNode;
  badge?: ReactNode;
  title?: string;
  snippet: string;
  stats: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <li
      data-pending={pending ? 'true' : undefined}
      className="relative rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-all duration-200"
    >
      {pending ? (
        <div className="absolute bottom-0 left-0 top-0 w-1.5 rounded-l-xl bg-primary-container" />
      ) : null}
      <div className={`flex flex-col space-y-space-sm ${pending ? 'pl-space-sm' : ''}`}>
        <div className="flex items-center justify-between gap-space-sm">
          <div className="flex flex-wrap items-center gap-2">{meta}</div>
          {badge}
        </div>
        <div className="flex items-start gap-space-md">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant shadow-sm">
            <Icon name="feed" size={24} />
          </div>
          <div className="min-w-0 flex-1">
            {title ? (
              <h3 className="truncate font-title-md text-title-md text-on-surface">{title}</h3>
            ) : null}
            <p className="mt-0.5 line-clamp-3 font-body-sm text-body-sm text-on-surface-variant">
              {snippet}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-space-md">{stats}</div>
          </div>
        </div>
        {footer}
      </div>
    </li>
  );
}

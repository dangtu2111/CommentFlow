import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

/**
 * Đầu trang Bài viết (design/stitch/posts.png): đường dẫn, tiêu đề + chip số bài, mô tả; `actions` (tùy chọn) là cụm
 * nút bên phải — trang thật chưa có hành động nào (đồng bộ/gắn hàng loạt chưa làm) nên không truyền.
 */
export async function PostsHeader({ total, actions }: { total: number; actions?: ReactNode }) {
  const t = await getTranslations('posts');
  return (
    <header className="posts-header">
      <div className="posts-header-text">
        <nav className="posts-breadcrumb" aria-label={t('breadcrumb.label')}>
          <span>{t('breadcrumb.operations')}</span>
          <span aria-hidden="true">›</span>
          <span>{t('breadcrumb.content')}</span>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{t('breadcrumb.current')}</span>
        </nav>
        <div className="posts-title-row">
          <h1>{t('heading')}</h1>
          <span className="posts-total">{t('count', { count: total })}</span>
        </div>
        <p className="posts-subtitle">{t('subtitle')}</p>
      </div>
      {actions ? <div className="posts-header-actions">{actions}</div> : null}
    </header>
  );
}

import { getTranslations } from 'next-intl/server';
import { Icon } from '../ui/icon';
import { Pill } from '../ui/pill';

const softButton =
  'flex h-10 cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-2 font-title-sm text-title-sm opacity-60 shadow-sm transition-all';

/**
 * Đầu trang Bài viết (design/stitch/posts.html): đường dẫn 3 cấp, tiêu đề + số bài, mô tả và các nút chính.
 * "Đồng bộ bài mới", "Gắn sản phẩm hàng loạt", chuyển danh sách/lưới chưa có chức năng → hiện đúng thiết kế,
 * vô hiệu (`aria-disabled`) kèm "Sắp có". Chỉ dùng bên trong `.tw`.
 */
export async function PostsHeader({ count, bulkCount }: { count: number; bulkCount?: number }) {
  const t = await getTranslations('posts');
  const soon = t('soon');
  return (
    <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
      <div className="space-y-space-xs">
        <nav
          aria-label={t('breadcrumb.label')}
          className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant"
        >
          <span>{t('breadcrumb.operations')}</span>
          <Icon name="chevron_right" size={12} />
          <span>{t('breadcrumb.content')}</span>
          <Icon name="chevron_right" size={12} />
          <span aria-current="page" className="font-semibold text-primary">
            {t('breadcrumb.current')}
          </span>
        </nav>
        <div className="flex items-center gap-space-sm">
          <h1 className="font-headline-md text-headline-md tracking-tight text-on-surface">
            {t('heading')}
          </h1>
          <Pill tone="surface" className="px-2.5 text-primary">
            {t('count', { count })}
          </Pill>
        </div>
        <p className="max-w-2xl font-body-md text-body-md text-on-surface-variant">
          {t('subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-space-sm">
        <span
          className={`${softButton} bg-surface-container-low text-on-surface`}
          aria-disabled="true"
          title={soon}
        >
          <span className="text-primary">
            <Icon name="sync" size={16} />
          </span>
          <span>{t('actions.sync')}</span>
        </span>
        <span
          className={`${softButton} bg-secondary px-3.5 text-on-secondary`}
          aria-disabled="true"
          title={soon}
        >
          <Icon name="auto_fix_high" size={16} />
          <span>
            {bulkCount === undefined
              ? t('actions.bulk')
              : t('actions.bulkCount', { count: bulkCount })}
          </span>
        </span>
        <div className="flex items-center rounded-lg bg-surface-container-low p-1">
          <span
            className="rounded bg-surface-container-lowest p-1.5 text-primary shadow-sm"
            title={t('actions.viewList')}
          >
            <Icon name="format_list_bulleted" size={16} />
          </span>
          <span
            className="cursor-not-allowed rounded p-1.5 text-on-surface-variant opacity-60"
            aria-disabled="true"
            title={`${t('actions.viewGrid')} — ${soon}`}
          >
            <Icon name="grid_view" size={16} />
          </span>
        </div>
      </div>
    </div>
  );
}

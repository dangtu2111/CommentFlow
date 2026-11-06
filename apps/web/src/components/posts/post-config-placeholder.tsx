import { getTranslations } from 'next-intl/server';
import { Icon } from '../ui/icon';
import { Pill } from '../ui/pill';

/**
 * Khung "Cấu hình bài viết & AI" (design/stitch/posts.html, cột phải 5/12) ở route thật: chưa có chức năng chọn bài
 * và lưu cấu hình (gap POSTS-LINK-PRODUCT-UI, POST-NOTES UI) nên chỉ hiện tiêu đề + chú thích "Sắp có", KHÔNG bịa
 * sản phẩm/ghi chú. Bản đủ thành phần với dữ liệu [MẪU] ở `/dev/ui/kb-posts`. Chỉ dùng bên trong `.tw`.
 */
export async function PostConfigPlaceholder() {
  const t = await getTranslations('posts');
  return (
    <section
      aria-label={t('panel.title')}
      aria-disabled="true"
      className="sticky top-20 space-y-space-sm rounded-xl bg-surface-container-lowest p-space-lg opacity-80 shadow-sm lg:col-span-5"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-primary">
          <Icon name="tune" size={18} />
        </span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">{t('panel.title')}</h2>
        <Pill tone="muted">{t('soon')}</Pill>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{t('panel.hint')}</p>
    </section>
  );
}

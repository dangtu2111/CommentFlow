import { notFound } from 'next/navigation';
import { PostsList, type PostsListItem } from '../../../../components/posts/posts-list';
import { PostsTabs } from '../../../../components/posts/posts-tabs';
import type { PostsView } from '../../../../lib/posts-filters';

const VIEW: PostsView = { sort: 'pending', page: 1 };

/** Mọi chữ hiện ở trang mẫu dev đều gắn "[MẪU]" (không đi qua i18n vì không phải giao diện thật). */
const SAMPLE = {
  banner: '[MẪU] Dữ liệu mẫu — không phải số liệu thật',
  panel: '[MẪU] Cấu hình bài viết & AI',
  product: '[MẪU] Váy hoa nhí tay bồng',
  sku: 'SKU: MAU-01 · Còn [MẪU] chiếc',
  note: '[MẪU] Ghi chú riêng cho bài viết',
  noteBody: '[MẪU] Ghi chú mẫu cho AI.',
  mode: '[MẪU] Chế độ AI trả lời riêng cho bài này',
  modeDefault: '[MẪU] Theo cài đặt mặc định của kênh',
  modeManual: '[MẪU] Luôn duyệt tay trước khi gửi',
  ai: '[MẪU] AI',
} as const;

const SAMPLE_POSTS: PostsListItem[] = [
  {
    id: 'mau-1',
    channelName: '[MẪU] Cửa hàng mẫu',
    platform: 'facebook',
    externalId: 'mau_post_001',
    message: '[MẪU] Bộ sưu tập hè — nội dung mẫu để xem bố cục, không phải bài thật.',
    permalink: null,
    isAd: true,
    createdTime: new Date('2026-11-05T03:24:00Z'),
    commentCount: 24,
    pendingCount: 18,
  },
  {
    id: 'mau-2',
    channelName: '[MẪU] ig_mau',
    platform: 'instagram',
    externalId: 'mau_post_002',
    message: '[MẪU] Áo sơ mi linen — nội dung mẫu.',
    permalink: null,
    isAd: false,
    createdTime: new Date('2026-11-04T03:24:00Z'),
    commentCount: 6,
    pendingCount: 0,
  },
];

/**
 * Trang xem giao diện Bài viết với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'` (UI-first 06/11/2026, QUKP1).
 * Panel "Cấu hình bài viết & AI" chưa có chức năng nên chỉ dựng ở đây (không nút hoạt động).
 */
export default async function DevKbPostsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="app-page app-page-wide">
      <p className="badge badge-off">{SAMPLE.banner}</p>
      <div className="dev-kb-posts">
        <div className="posts-dev-feed">
          <PostsTabs view={VIEW} />
          <PostsList view={VIEW} items={SAMPLE_POSTS} total={142} pageCount={8} timeZone="UTC" />
        </div>
        <aside className="post-config" aria-label={SAMPLE.panel}>
          <h2>{SAMPLE.panel}</h2>
          <div className="post-config-product">
            <strong>{SAMPLE.product}</strong>
            <span>{SAMPLE.sku}</span>
          </div>
          <h3>{SAMPLE.note}</h3>
          <textarea readOnly aria-label={SAMPLE.note} defaultValue={SAMPLE.noteBody} />
          <h3>{SAMPLE.mode}</h3>
          <label className="post-config-mode">
            <input type="radio" name="mau-mode" defaultChecked disabled />
            {SAMPLE.modeDefault}
          </label>
          <label className="post-config-mode">
            <input type="radio" name="mau-mode" disabled />
            {SAMPLE.modeManual}
          </label>
          <span className="post-config-ai">{SAMPLE.ai}</span>
        </aside>
      </div>
    </main>
  );
}

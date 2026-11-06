import {
  Info,
  Link2,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { PostsHeader } from '../../../../components/posts/posts-header';
import { PostsList, type PostsListItem } from '../../../../components/posts/posts-list';
import { PostsTabs } from '../../../../components/posts/posts-tabs';
import { PostsToolbar } from '../../../../components/posts/posts-toolbar';
import type { PostsView } from '../../../../lib/posts-filters';

const VIEW: PostsView = { sort: 'pending', page: 1 };
const M = '[MẪU]';

const SAMPLE_POSTS: PostsListItem[] = [
  {
    id: 'mau-1',
    channelName: `${M} Cửa hàng mẫu`,
    platform: 'facebook',
    externalId: 'mau_post_001',
    message: `${M} Bộ sưu tập hè — nội dung mẫu để xem bố cục, không phải bài thật. Chất liệu và kiểu dáng chỉ là chữ giữ chỗ.`,
    permalink: 'https://example.com/mau',
    isAd: true,
    createdTime: new Date('2026-11-05T03:24:00Z'),
    commentCount: 24,
    pendingCount: 18,
  },
  {
    id: 'mau-2',
    channelName: `${M} ig_mau`,
    platform: 'instagram',
    externalId: 'mau_post_002',
    message: `${M} Áo sơ mi linen — nội dung mẫu.`,
    permalink: null,
    isAd: false,
    createdTime: new Date('2026-11-04T03:24:00Z'),
    commentCount: 6,
    pendingCount: 0,
  },
  {
    id: 'mau-3',
    channelName: `${M} tiktok_mau`,
    platform: 'tiktok',
    externalId: 'mau_post_003',
    message: `${M} Video thử đồ — nội dung mẫu.`,
    permalink: null,
    isAd: true,
    createdTime: new Date('2026-11-03T03:24:00Z'),
    commentCount: 15,
    pendingCount: 15,
  },
];

const SAMPLE_CHANNELS = [{ id: 'mau-c1', name: `${M} Cửa hàng mẫu`, platform: 'facebook' }];

/** Mọi chữ hiện ở trang mẫu dev đều gắn "[MẪU]" (không đi qua i18n vì không phải giao diện thật). */
function SampleConfigPanel() {
  return (
    <aside className="post-config" aria-label={`${M} Cấu hình bài viết & AI`}>
      <div className="post-config-head">
        <SlidersHorizontal size={18} aria-hidden="true" />
        <h2>{M} Cấu hình bài viết &amp; AI</h2>
      </div>
      <p className="post-config-sub">{M} Thiết lập dữ liệu ngữ cảnh cho bài đã chọn.</p>
      <div className="post-config-post">
        <strong>{M} Bộ sưu tập hè — nội dung mẫu</strong>
        <span>{M} Kênh: Cửa hàng mẫu · Đăng: 10:24 hôm nay</span>
      </div>
      <h3>
        <Link2 size={16} aria-hidden="true" /> {M} Sản phẩm gắn kèm cho bài
      </h3>
      <div className="post-config-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" disabled placeholder={`${M} Tìm theo tên hoặc mã SKU…`} />
      </div>
      <div className="post-config-linked">
        <span className="post-config-thumb" aria-hidden="true" />
        <div>
          <strong>{M} Váy hoa nhí tay bồng</strong> <em className="post-config-main">Chính</em>
          <span>{M} SKU: MAU-01 · giá/tồn kho đọc từ danh mục sản phẩm</span>
        </div>
        <Trash2 size={16} aria-hidden="true" />
      </div>
      <button type="button" className="post-config-add" disabled>
        <Plus size={16} aria-hidden="true" /> {M} Gắn thêm sản phẩm phụ
      </button>
      <h3>{M} Ghi chú riêng cho bài viết</h3>
      <textarea readOnly aria-label={`${M} Ghi chú`} defaultValue={`${M} Ghi chú mẫu cho AI.`} />
      <h3>{M} Chế độ AI trả lời riêng cho bài này</h3>
      <label className="post-config-mode" data-selected="true">
        <input type="radio" name="mau-mode" defaultChecked disabled />
        <span>
          <strong>{M} Theo cài đặt mặc định của kênh</strong>
          <small>{M} Mô tả mẫu.</small>
        </span>
      </label>
      <label className="post-config-mode">
        <input type="radio" name="mau-mode" disabled />
        <span>
          <strong>{M} Luôn duyệt tay trước khi gửi</strong>
          <small>{M} Mô tả mẫu.</small>
        </span>
      </label>
      <label className="post-config-mode">
        <input type="radio" name="mau-mode" disabled />
        <span>
          <strong>{M} Tắt hoàn toàn AI trên bài này</strong>
          <small>{M} Mô tả mẫu.</small>
        </span>
      </label>
      <p className="post-config-info">
        <Info size={16} aria-hidden="true" />
        <span>
          {M} Nguyên tắc ưu tiên: ghi chú của bài → sản phẩm gắn kèm → cơ sở kiến thức chung.
        </span>
      </p>
      <div className="post-config-actions">
        <button type="button" className="btn btn-tint" disabled>
          {M} Hủy thay đổi
        </button>
        <button type="button" className="btn btn-primary" disabled>
          <Save size={16} aria-hidden="true" /> {M} Lưu
        </button>
      </div>
    </aside>
  );
}

/**
 * Trang xem giao diện Bài viết với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'` (UI-first 06/11/2026, QUKP1).
 * Nút đầu trang, biểu ngữ "chưa liên kết", số đếm theo tab và panel "Cấu hình bài viết & AI" chưa có chức năng/dữ liệu
 * nên chỉ dựng ở đây (không nút hoạt động, mọi chữ gắn [MẪU]).
 */
export default async function DevKbPostsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <DevShell>
      <main className="posts">
        <p className="inbox-sample-note" role="note">
          {DEV_SAMPLE_NOTE}
        </p>
        <PostsHeader
          total={142}
          actions={
            <>
              <button type="button" className="btn btn-tint" disabled>
                {M} Đồng bộ bài viết mới
              </button>
              <button type="button" className="btn btn-ai" disabled>
                {M} Gắn sản phẩm hàng loạt
              </button>
            </>
          }
        />
        <div className="posts-alert" role="note">
          <TriangleAlert size={20} aria-hidden="true" />
          <div>
            <strong>{M} Có bài chưa liên kết với kho hàng</strong>
            <p>{M} Dòng mô tả mẫu — số liệu thật chưa có (gap POSTS-LINK-PRODUCT-UI).</p>
          </div>
        </div>
        <div className="dev-kb-posts">
          <div className="dev-kb-posts-main">
            <section className="posts-filters">
              <PostsTabs
                view={VIEW}
                counts={{ all: 142, facebook: 86, instagram: 38, tiktok: 18 }}
              />
              <PostsToolbar view={VIEW} channels={SAMPLE_CHANNELS} />
            </section>
            <section className="posts-panel">
              <PostsList
                view={VIEW}
                items={SAMPLE_POSTS}
                total={142}
                pageCount={12}
                timeZone="UTC"
              />
            </section>
          </div>
          <SampleConfigPanel />
        </div>
      </main>
    </DevShell>
  );
}

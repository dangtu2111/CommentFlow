import Link from 'next/link';
import type { ReactNode } from 'react';
import { getBrand } from '../../server/brand';
import { Icon } from '../ui/icon';
import { SoonLink } from './pub-parts';

type NavItem = { label: string; href?: string };

/** Mọi chữ ở khung trang công khai mẫu đều là "[MẪU]" (trang dev, không đi qua i18n). */
const NAV: readonly NavItem[] = [
  { label: 'Tính năng', href: '/dev/ui/landing' },
  { label: 'Giải pháp' },
  { label: 'Bảng giá', href: '/dev/ui/landing#bang-gia' },
  { label: 'Vòng lặp AI' },
  { label: 'Hướng dẫn' },
];

const NAV_LINK =
  'font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors';
const FOOT_LINK =
  'font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors';
const FOOT_LINK_SM =
  'font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors';

const FOOT_COLUMNS: readonly { title: string; links: readonly NavItem[] }[] = [
  {
    title: 'Giải pháp',
    links: [
      { label: 'Tự động hóa Fanpage' },
      { label: 'Quản trị Instagram Direct' },
      { label: 'TikTok Shop Live Stream' },
      { label: 'Vòng lặp AI Tự Học' },
    ],
  },
  {
    title: 'Tài nguyên',
    links: [
      { label: 'Tài liệu API & Webhook' },
      { label: 'Cẩm nang triển khai CSKH' },
      { label: 'Bảng so sánh gói dịch vụ', href: '/dev/ui/landing#bang-gia' },
      { label: 'Cập nhật phiên bản' },
    ],
  },
  {
    title: 'Pháp lý & Bảo mật',
    links: [
      { label: 'Chính sách bảo mật', href: '/dev/ui/privacy' },
      { label: 'Điều khoản dịch vụ', href: '/dev/ui/terms' },
      { label: 'Xóa dữ liệu người dùng', href: '/dev/ui/privacy' },
      { label: 'Trạng thái máy chủ (Status)' },
    ],
  },
];

function NavLink({ item, className }: { item: NavItem; className: string }) {
  if (!item.href) return <SoonLink className={className}>{item.label}</SoonLink>;
  return (
    <Link href={item.href} className={className}>
      {item.label}
    </Link>
  );
}

/** Khung chung cho trang công khai (đầu trang + chân trang) theo design/stitch/landing-pricing.html. */
export function PublicShell({ children }: { children: ReactNode }) {
  const { name } = getBrand();
  return (
    <div className="tw bg-surface font-body-md text-body-md text-on-surface antialiased selection:bg-primary-fixed selection:text-on-primary-fixed">
      <header className="fixed top-0 left-0 right-0 w-full z-50 bg-surface-container-lowest/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-16 max-w-7xl mx-auto px-margin flex items-center justify-between gap-gutter">
          <div className="flex items-center gap-space-xl">
            <Link href="/dev/ui/landing" className="flex items-center gap-space-sm">
              <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center text-on-primary">
                <Icon name="chat_bubble" size={20} />
              </div>
              <div className="flex items-center gap-space-xs">
                <span className="font-title-md text-title-md text-on-surface tracking-tight font-bold">
                  {name}
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm uppercase">
                  AI
                </span>
              </div>
            </Link>
            <nav className="hidden lg:flex items-center gap-space-xl" aria-label="[MẪU] Điều hướng">
              {NAV.map((item) => (
                <NavLink key={item.label} item={item} className={NAV_LINK} />
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-space-md">
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center justify-center px-space-md py-space-xs text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-space-xs px-space-lg py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
            >
              <Icon name="bolt" size={16} />
              <span>Dùng thử miễn phí</span>
            </Link>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center ml-space-xs text-on-primary">
              <Icon name="person" size={18} />
            </div>
          </div>
        </div>
      </header>
      <main className="w-full pt-16 bg-surface min-h-[calc(100vh-4rem)]">
        <div className="flex flex-col w-full">
          <p className="mx-auto mt-space-sm w-full max-w-7xl px-margin font-label-sm text-label-sm text-on-surface-variant">
            [MẪU] Trang mẫu — chưa phải trang công khai thật (chờ PUBLIC-PAGES).
          </p>
          {children}
        </div>
      </main>
      <footer className="w-full bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-margin pt-space-xl pb-margin">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-space-xl pb-space-xl">
            <div className="lg:col-span-2 flex flex-col gap-space-md pr-space-lg">
              <div className="flex items-center gap-space-sm">
                <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-on-primary">
                  <Icon name="chat_bubble" size={18} />
                </div>
                <span className="font-title-md text-title-md text-on-surface font-bold">
                  {name} AI
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-sm">
                [MẪU] Hệ thống hỗ trợ phản hồi bình luận &amp; tin nhắn đa kênh cho shop và agency.
                Chưa có tên công ty, địa chỉ hay chứng nhận thật.
              </p>
              <div className="flex items-center gap-space-sm p-space-sm rounded-lg bg-surface-container-low max-w-sm text-primary">
                <Icon name="verified" size={20} />
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface font-bold">
                    [MẪU] Chưa có chứng nhận đối tác
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Chỉ dùng API chính thức của nền tảng
                  </span>
                </div>
              </div>
            </div>
            {FOOT_COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-space-sm">
                <span className="font-title-sm text-title-sm text-on-surface uppercase tracking-wider">
                  {col.title}
                </span>
                <ul className="flex flex-col gap-space-xs">
                  {col.links.map((link) => (
                    <li key={link.label} className="list-none">
                      <NavLink item={link} className={FOOT_LINK} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-space-lg flex flex-col md:flex-row items-center justify-between gap-space-md bg-surface-container-lowest">
            <p className="font-body-sm text-body-sm text-on-surface-variant text-center md:text-left">
              [MẪU] © Tên sản phẩm. Bảo lưu mọi quyền. Nội dung pháp lý chờ duyệt.
            </p>
            <div className="flex items-center gap-space-md">
              <Link href="/dev/ui/privacy" className={FOOT_LINK_SM}>
                Bảo mật
              </Link>
              <Link href="/dev/ui/terms" className={FOOT_LINK_SM}>
                Điều khoản
              </Link>
              <Link href="/dev/ui/privacy" className={FOOT_LINK_SM}>
                User Data Deletion
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

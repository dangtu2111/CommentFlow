import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '../brand-logo';

/** Mọi chữ ở khung trang công khai mẫu đều là "[MẪU]" (trang dev, không đi qua i18n). */
const NAV = [
  { href: '/dev/ui/landing', label: 'Tính năng' },
  { href: '/dev/ui/landing#bang-gia', label: 'Bảng giá' },
  { href: '/dev/ui/privacy', label: 'Quyền riêng tư' },
  { href: '/dev/ui/terms', label: 'Điều khoản' },
] as const;

/** Khung chung cho trang công khai (đầu trang + chân trang) theo design/stitch/landing-pricing.png. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="rl-pub">
      <header className="rl-pub-top">
        <BrandLogo href="/dev/ui/landing" />
        <nav className="rl-pub-nav" aria-label="[MẪU] Điều hướng">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className="rl-link" href="/login">
          Đăng nhập
        </Link>
        <Link className="rl-btn" href="/register">
          Dùng thử miễn phí
        </Link>
      </header>
      <main className="rl-pub-body">{children}</main>
      <footer className="rl-pub-foot">
        <div>
          <BrandLogo href="/dev/ui/landing" />
          <p className="muted">
            [MẪU] Mô tả ngắn sản phẩm. Chưa có tên công ty, địa chỉ hay chứng nhận thật.
          </p>
        </div>
        <div>
          <p className="rl-eyebrow">Pháp lý</p>
          <ul>
            <li>
              <Link href="/dev/ui/privacy">Chính sách quyền riêng tư</Link>
            </li>
            <li>
              <Link href="/dev/ui/terms">Điều khoản &amp; DPA</Link>
            </li>
          </ul>
        </div>
        <p className="muted">[MẪU] © Tên sản phẩm. Nội dung pháp lý chờ duyệt.</p>
      </footer>
    </div>
  );
}

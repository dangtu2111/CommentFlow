import { BrandLogo } from '../brand-logo';
import { LocaleSwitcher } from '../locale-switcher';

/**
 * Thanh trên gọn cho trang đứng riêng (onboarding, 403, 404): thương hiệu + ngôn ngữ (+ chip workspace khi biết).
 * Không có liên kết/huy hiệu trạng thái giả ("All Systems Operational" trong thiết kế bị bỏ — Q-UIS1).
 */
export function SimpleTopbar({ href, workspaceName }: { href: string; workspaceName?: string }) {
  return (
    <header className="simple-top">
      <BrandLogo href={href} />
      {workspaceName ? <span className="chip-live">{workspaceName}</span> : null}
      <div className="simple-top-end">
        <LocaleSwitcher />
      </div>
    </header>
  );
}

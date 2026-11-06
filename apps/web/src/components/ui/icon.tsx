import { ICON_PATHS } from './icon-paths';

/**
 * Bảng ánh xạ tên Material Symbols (Outlined, FILL 0, wght 400) → path SVG, viewBox `0 -960 960 960`.
 * HTML Stitch dùng phông Material Symbols; CSP của app chỉ cho `font-src 'self'` nên vẽ lại bằng SVG nội tuyến.
 * Bảng nằm ở icon-paths.ts (sinh tự động); thêm icon mới: `node e2e/support/fetch-material-icons.mjs --stitch` hoặc `... <tên>`.
 */

export type IconName = keyof typeof ICON_PATHS;

/** Icon SVG nội tuyến, tô theo `currentColor`. Trang trí (`aria-hidden`); nghĩa nằm ở chữ bên cạnh. `size` tính bằng px (mặc định 14 = `text-sm` của Stitch). */
export function Icon({
  name,
  size = 14,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/**
 * Chế độ giao diện Sáng / Tối / Theo hệ thống (Cài đặt › Tùy chọn hiển thị). Lựa chọn lưu ở `users.theme` (bản lưu) và cookie
 * `cf-theme` (nguồn cho lần tải đầu, đọc được ngay ở máy chủ nên không cần truy vấn DB mỗi trang). Áp bằng thuộc tính
 * `data-theme` trên `<html>`; máy chủ render sẵn sáng/tối, còn "theo hệ thống" do script chạy TRƯỚC KHI VẼ quyết định
 * (không nháy sáng). Token màu tối nằm ở `styles/theme-dark.css` (chép từ HTML Stitch).
 */
export const THEME_COOKIE = 'cf-theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemeChoice = 'light' | 'dark' | 'system';

export function parseThemeChoice(value: string | undefined | null): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Giá trị `data-theme` máy chủ có thể đặt ngay; `system` → undefined (script quyết định theo hệ thống). */
export function themeAttrFor(choice: ThemeChoice): 'light' | 'dark' | undefined {
  return choice === 'system' ? undefined : choice;
}

/** Script nội tuyến (không dữ liệu người dùng nào được ghép vào chuỗi). */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var c=m?m[1]:'system';var d=c==='dark'||(c!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;

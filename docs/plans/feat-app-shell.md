# Kế hoạch `feat/app-shell` — khung ứng dụng (sidebar, thanh trên, chỗ cho banner)

## Việc

Mã MASTER/gap: `APP-SHELL` · Spec: `docs/08` §3 (khung ứng dụng: sidebar, thanh trên, banner hệ thống), thiết kế `design/stitch/comments.png` (bố cục), `docs/08` §7 (tiếp cận/responsive).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Thay header tạm bằng khung ứng dụng thật: thanh trên (thương hiệu, bộ chuyển workspace, ngôn ngữ, tên người dùng + Đăng xuất) và thanh điều hướng bên trái (desktop) / hàng cuộn ngang (mobile), có sẵn một khe cho banner hệ thống (kênh mất kết nối...) ở việc sau. Chỉ liệt kê trang **đã tồn tại** (Bình luận, Thành viên chỉ Owner, Bảo mật) — mục chưa có trang thêm dần khi tính năng ra đời, không tạo liên kết chết. Rủi ro thấp: chỉ giao diện, không đổi dữ liệu/quyền.

## Điểm chưa rõ

Không có. Quyết định theo spec (không bịa): chưa dựng "AI tự động: đang bật ở N kênh", "Dừng khẩn cấp", đồng hồ lượt AI, bộ lọc kênh toàn cục, tìm kiếm toàn cục (đều cần dữ liệu/tính năng chưa có: `automation`, `Dừng khẩn cấp`, `FR-005-SEARCH`) — ghi gap. Nhóm sidebar theo docs/08 §3: "Điều hướng vận hành" và "Cài đặt".

## Tiêu chí nghiệm thu

1. `navItemsFor(role)` (`apps/web/src/lib/app-nav.ts`, thuần): Owner thấy Bình luận, Thành viên, Bảo mật; Staff/Admin không thấy Thành viên (đúng docs/13 §3.1: trang chỉ Owner); mỗi mục có `href` thuộc `/app/...` đang tồn tại, không trùng — test đơn vị.
2. `isNavActive(pathname, href)`: khớp đúng đường dẫn và các trang con (`/app/comments?x` coi như `/app/comments`), không khớp tiền tố giả (`/app/commentsX`) — test đơn vị (bảng).
3. Khung `(guarded)/layout.tsx`: thanh trên + sidebar + vùng nội dung; mục đang mở có `aria-current="page"`; nhóm có nhãn; điều hướng bàn phím được (liên kết thật); có khe `data-slot="banners"` cho `CH-STATUS-BANNER`; Đăng xuất bằng form POST (`logoutAction`); bộ chọn ngôn ngữ chuyển được vi/en — build + test đơn vị + kiểm tay.
4. Mobile 390px: sidebar thành hàng chip cuộn ngang dưới thanh trên, không tràn ngang trang; desktop ≥ 900px: cột trái cố định — kiểm tay (KT-004) + CSS.
5. Trang `/app` (chào mừng tạm) bỏ nút Đăng xuất/ngôn ngữ trùng lặp (đã nằm ở khung); các trang `members`, `security`, `comments` hiển thị đúng trong khung (không tràn, không hai thanh cuộn).
6. vi + en đủ khóa (`lint:i18n` xanh); màu/chữ từ token.
7. Công cụ xanh (đọc mã thoát): lint, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test, test:trace, test:coverage, `next build`.

## File sẽ đọc / sửa

Đọc (đã đọc): `docs/08` §3, `design/stitch/comments.png`, `(guarded)/layout.tsx`, `page.tsx`, `members/page.tsx`, `components/locale-switcher.tsx`, `components/app/workspace-switcher.tsx`, `(auth)/actions.ts` (`logoutAction`), `globals.css` (`.app-header`, `.app-page`).
Tạo/sửa: `apps/web/src/lib/app-nav.ts` (+ test), `components/app/shell-nav.tsx` (client: `usePathname`), `components/app/user-menu.tsx`, `(guarded)/layout.tsx`, `(guarded)/page.tsx`, `globals.css`, `packages/shared/src/i18n/messages/{vi,en}.json`, `design/stitch/README.md`, `docs/testing/KIEM_TRA_TAY.md` (KT-004), `docs/codemap.md`, `docs/gap-matrix.md`.

## Migration

Không có.

## Test viết trước

Tiêu chí 1–2 (lib thuần). Lệnh: `pnpm --filter @flow/web exec vitest run src/lib/app-nav.test.ts` · `pnpm --filter @flow/web build`.

## Cần kiểm chứng độc lập không?

Không: chỉ giao diện, không động vào xác thực/dữ liệu (trang vẫn tự gọi `requireAppUser`; test quét hiện có phải còn xanh).

## Rủi ro

Khung dùng chung cho mọi trang `/app` nên lỗi bố cục lan rộng → kiểm tay KT-004 ở 3 trang. **Kiểm tra tay:** KT-004 (≤ 10 bước, vi + en).

## Đề xuất thay đổi

Không.

## Complexity tracking

Không đi ngược nguyên tắc nào.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời
- [x] Mỗi tiêu chí nghiệm thu kiểm được
- [x] Logic quy tắc có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (không)
- [x] Không thư viện mới
- [x] Danh sách file đủ
- [x] Không bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt theo `docs/PROMPT_BUILD_TOAN_BO.md` §2; chủ dự án giao `APP-SHELL` đầu hàng 06/11/2026).

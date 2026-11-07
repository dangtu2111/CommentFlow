# Handoff `feat-wire-settings-members` (claude, làn a)

## Đã làm
- Trang Thành viên đã dựng Tailwind trong khung Cài đặt từ trước; backend (mời/thu hồi/mời lại/đổi vai trò/tạm khóa/gỡ/rời/Owner cuối) đã có. Lát này: bỏ ma trận quyền tĩnh bịa, nút giả "Sắp có", cột quyền cố định; thêm `roleAccessRows()` (`lib/app-nav.ts`) và bảng "Quyền truy cập theo vai trò" suy ra từ `ENTRIES`; liên kết "Rời workspace" ở hàng của mình; E2E `settings-members.spec.ts` vi + en.
- Quyết định `Q-WMEM1`; kiểm tay `KT-WMEM`.

## Đã đọc và rút ra
- Vai trò thật chỉ Owner/Staff. Hàng của chính mình luôn khóa nên "Owner cuối cùng" trên UI chỉ thể hiện ở `/app/leave` (DB còn trigger chặn).
- `pnpm e2e` chế độ build bị Turbopack panic trên máy yếu bộ nhớ; chạy bằng `E2E_WEB_MODE=dev`.

- Bỏ cả công tắc "Che SĐT" giả trong form mời (`invite-form.tsx`). Revoke ngay sau resend không thấy dòng biến mất nếu không tải lại (E2E phải `reload` trước khi thu hồi) — nghi ngờ làm mới UI chậm, chưa xác định có phải lỗi thật; nên xem lại.
- ui:fidelity: lệch hình học còn lại do khung ứng dụng (thanh bên, header) và nội dung Stitch bịa đã bỏ; xem `docs/plans/ui-fidelity/settings-members/`.

## Còn lại
- Vai trò Admin (migration + RLS) và phân công kênh/che SĐT khi mời: để sau (xem plan).

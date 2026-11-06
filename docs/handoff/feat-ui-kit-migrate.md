# Bàn giao `feat-ui-kit-migrate` (agent: claude, làn a)

## Đã làm
PR2: `Avatar badge` (4 nơi), `Tabs pill` (PostsTabs), `Stepper` chung (onboarding + 2FA), xóa CSS `.inbox-avatar*`/`.msg-avatar*`/`.msg-platform*`/`.posts-tab*`/hai bản `.stepper*`/`.panel-points`/`.shell-user`.

## Đã đọc và rút ra
- Kit nạp TRƯỚC `globals.css` (Q-UIKIT1). Lớp động (`chip-*`, `mode-pill-*`, `invoice-status-*`) không phải selector chết dù grep không thấy.
- Tab `.inbox-tab*` (có chấm màu + đếm) và `.msg-tab*` (danh sách dọc) mỗi cái 1 nơi dùng → chưa gộp.

## Còn lại
- Chưa so bounding box bằng Playwright (không kiểm được preview trong phiên này) — nên chụp /dev/ui/comments, messages, settings, onboarding trước merge.
- EmptyState (`.inbox-empty` + các `*-empty`), Table (`.auto-table` + bảng khác), AppShell/Sidebar, `.banner`/`.member-item`/`.session-item` trùng, chuyển trang nhóm 2 (cài đặt, kiến thức, tự gửi, spam, lead).

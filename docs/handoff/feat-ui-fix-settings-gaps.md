# Handoff `feat-ui-fix-settings-gaps` (claude, làn a)

**Đã làm:** `SplitLayout` thành bố cục thật (header → [cột con | chồng thẻ]) với một biến `--settings-gap` 16px; bỏ `display: contents` + cột con trải 40 hàng (gốc của khoảng cách thẻ giãn khi cột con cao hơn nội dung). View Gói/Quyền riêng tư/Thông báo/Thành viên tự dựng `SettingsFrame` (trang truyền `frame`); Kênh/Bảo mật truyền `header`. Lề `.app-page-settings` 16px. Quyết định: `q-uisgap1`.

**Kết quả đo** (`node e2e/tools/settings-gaps.mjs`, server xem trước :3101, 1280/1440/1920/2560): khoảng cách thẻ 16 (Stitch 16), đầu trang→lưới 16 (16), cột↔nội dung 16, lề trái=phải=16 ở mọi rộng. "Đỉnh trang" 50 ở các trang dev có ghi chú [MẪU] phía trên — chỉ ở `/dev/ui`; trang thật 16.

**Chưa kiểm được:** trang thật `/app/channels` (cần đăng nhập) — cùng `SplitLayout`/`SettingsFrame` nên dùng chung sửa; chủ dự án xem lại bằng mắt.

**Còn lại:** không có. Nhật ký (`/app/activity`) không dùng `SettingsFrame` — ngoài phạm vi.

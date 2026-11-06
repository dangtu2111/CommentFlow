# Bàn giao `feat-ui-messages` (claude, làn d)

**Đã làm:** vỏ Tin nhắn 3 cột ở `/dev/ui/messages` (dữ liệu `[MẪU]`), `messageWindowState` + test, `avatarInitial`, i18n `messagesUi` vi/en, ảnh 1440/390 ở `docs/plans/ui-fidelity/ui-messages/`.
**Đã đọc/rút ra:** thanh bên chỉ liệt kê trang thật (`app-nav.ts`) → không thêm "Tin nhắn"; trang dev dựng shell bằng `ShellNav`; `.app-page-wide` giới hạn 880px nên cần `.app-page-full`.
**Còn lại:** `MESSAGES-PAGE` (route thật `/app/messages` + mục thanh bên + dữ liệu thật + hai ngăn mobile) sau `MESSENGER-WEBHOOK`; nối `messageWindowState` với `sendRecheck` R8 ở lúc gửi thật.
Lưu ý: server dev cũ ở cổng 3104 (không phải của phiên này) đang giữ i18n cũ nên báo thiếu `shell.groups.system`; ảnh chụp dùng server tạm cổng 3103.

# Handoff `feat-tw-messages-auth` (làn a, claude)

**Đã làm:** dựng lại Tin nhắn (`/dev/ui/messages`) và các trang xác thực + lời mời bằng Tailwind từ `design/stitch/{messages,auth-login-register,accept-invite}.html`; Server Action/tên ô giữ nguyên. Quyết định: `docs/plans/quyet-dinh/qtwma1.md`. Công cụ đã xanh: lint:i18n, typecheck, depcruise, check:plans, test:trace, test web (588).

**Điều rút ra:** luật lint i18n chỉ miễn hàm dịch tên `t` và chỉ khi gọi không nằm trong biểu thức JSX phức tạp: `tu(...)`, `t.rich(...)` trong JSX, mảng khóa literal đều bị báo → dùng `t('ui.…')` hoặc tính trước thành biến. Biểu tượng lucide sinh `<path`, test tìm `<p` phải dùng regex `/<p[\s>]/`.

**Còn lại:**
- `pnpm ui:fidelity` chưa đo (lệnh bị chặn ở phiên này; Git Bash cần `MSYS_NO_PATHCONV=1` cho route bắt đầu bằng `/`); máy xem trước 3101 có thể giữ bản cũ. Cần đo messages / auth-login-register / accept-invite ở 1440 và 1920.
- Gỡ import CSS cũ của auth/messages ở `app/layout.tsx` (PR `[CHUNG]`).
- Trang Tin nhắn thật (hiện chỉ route mẫu), chức năng cho nút "Sắp có", nút Google, bật 2FA khi đăng ký.
- `pnpm lint` toàn repo đỏ do cảnh báo/lỗi có sẵn ở `packages/*` và `globals.css` (không thuộc làn này); các thư mục của làn sạch với biome.

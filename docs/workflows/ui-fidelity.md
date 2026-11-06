# Đối chiếu giao diện với Stitch (`pnpm ui:fidelity`)

Dùng khi port một trang sang Tailwind (ADR 013). Không bắt buộc trong CI.

1. Dựng trang trong `<div className="tw">` bằng class chép từ `design/stitch/<slug>.html`; thêm `data-landmark="card|sidebar|primary-button"` cho phần tử mốc nếu selector mặc định đo nhầm.
2. Đo (máy xem trước đang chạy; cần mạng vì HTML Stitch nạp Tailwind CDN):
   `pnpm ui:fidelity <slug> <route> --base http://localhost:<cổng>` (Git Bash gõ `//dev/ui/x`).
3. Kết quả gồm: % chữ khớp (như trước) + bảng lệch hình học (rộng/cao, padding, margin, cỡ chữ, màu) của header, thanh bên, tiêu đề, card, nút chính. Ngưỡng ≤ 2px (`--tolerance`); màu phải trùng.
4. Sửa tới khi bảng lệch trống (hoặc ghi lý do lệch vào kế hoạch), nộp ảnh trước/sau ở `docs/plans/ui-fidelity/<mã>/`.
5. Kiểm trang CŨ không đổi: `node e2e/support/shot-regression.mjs <thư-mục>` trước và sau, rồi `node e2e/support/shot-regression.mjs --diff <trước> <sau>`.

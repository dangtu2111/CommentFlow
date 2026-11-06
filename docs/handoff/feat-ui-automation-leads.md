# Handoff feat-ui-automation-leads (claude, làn d)

**Đã làm:** QAL1 — `/app/automation` (thẻ đánh số, ô chế độ dạng viên màu theo `modeTone`, chú thích, thanh lưu), `/app/spam-rules` (header + khối nguyên tắc "AI không tự ẩn"), route dev [MẪU] `/dev/ui/{automation,spam-rules,leads}`, CSS `styles/auto-leads.css`, script chụp `e2e/support/shot-auto-leads.mjs`, ảnh "sau" ở `docs/plans/ui-fidelity/ui-auto-leads/`.

**Rút ra:** trang thật cần DB + phiên nên ảnh chụp từ trang mẫu dev (dùng đúng `AutomationForm`/`SpamRuleBuilder` thật); chữ trong JSX phải qua i18n hoặc hằng `SAMPLE` (lint:i18n); đổi màu ô chọn khi người dùng đổi giá trị cần JS (hiện chỉ màu theo giá trị đã lưu).

**Còn lại:** KPI tổng quan, Dừng khẩn cấp, kiểu trả lời công khai/nhắn riêng, danh sách quy tắc spam + bình luận bị ẩn thật, trang Leads thật (cần bảng leads, làn b: `LEADS-KANBAN`).

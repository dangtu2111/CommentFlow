# Bàn giao `feat/kb-rules` (Claude Code)

## Đã làm
- Trang chỉ đọc `/app/kb/rules` (Owner): điều cấm của Giọng văn, từ khóa chặn tự gửi, số chủ đề có câu mời chuyển người, ghi nhận dữ liệu còn thiếu; mục tắt "Sắp có" cho báo giá theo kênh và câu ứng xử riêng.
- Rail KB: "Quy tắc & Giới hạn" thành liên kết; bỏ khỏi mục "Sắp có" (còn "Tài liệu").
- Quyết định KHÔNG migration: `docs/plans/quyet-dinh/q-kb-rules-khong-migration.md`.

## File đã đọc + điều rút ra
- Cổng tự gửi kiểm `blockedKeywords` trên CÂU TRẢ LỜI NHÁP của AI (không phải tin khách) → nhãn trang ghi đúng như vậy.
- Giọng văn có `dont` (vào lệnh soạn) và `handoff_templates` (theo chủ đề, trong/ngoài giờ).

## Việc còn lại
- Nếu chủ dự án muốn: bảng `cf.reply_rules` + nối `decideAction` cho báo giá theo kênh (PR riêng, tự kiểm, EVAL).
- Chụp `ui:fidelity kb-rules`.
- Tiếp: Phần 4b–e.

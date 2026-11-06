# Handoff `feat-ui-fix-posts-layout` (claude, làn d)

**Đã làm:** Nguyên nhân gốc = `.app-page-wide { max-width: 880px }` bó MỌI trang nghiệp vụ (#192 chỉ sửa khung Cài đặt, không đụng lớp này) + cột phải Bài viết mẫu cố định 380px. Sửa: `.app-page-wide` trải hết (lề 16px), `.app-page-cap` 1720px cho Khách tiềm năng/Báo cáo, lưới Bài viết 12 cột 7/5, `.two-col*` dùng `minmax(0,…)`. Quyết định `q-uipl1`.

**Kết quả đo:** `docs/plans/ui-fidelity/ui-fix-posts-layout/so-khung.md` (7 trang × 1440/1920/2560) và `so-the-bai-viet.txt` (665/471 và 945/671 trùng Stitch). Lệch còn: KB/Spam lề 16 vs 24 (Stitch), Tin nhắn 16 vs 12; route `/dev/ui/*` không có thanh bên nên cột "Lệch" của bảng chênh 256 (đã trừ ở lề, xem cột lề).

**Còn lại:** không có. Chủ dự án xem lại bằng mắt trang thật `/app/posts` (cần đăng nhập, chưa đo được).

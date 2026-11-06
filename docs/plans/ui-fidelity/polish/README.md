# UI-FIDELITY vòng 2 — ảnh `polish`

`truoc/` và `sau/`: chụp bằng Playwright (Chromium) 1440px và 390px, toàn trang, web chạy cổng 3101. Trang dev `/dev/ui/*` dùng dữ liệu [MẪU]. Tên file: `<màn>-<rộng>.png` (login, register, forgot, reset, checkemail, notfound, devui = khung, comments, kbposts, automation, spam, leads). `verify` và `forbidden` chuyển về `/login` (cần phiên/token) nên không có ảnh riêng.

**Đã sửa (so trước/sau):**
- `comments-390`: trang không còn tràn ngang (trước rộng ~1377px); tab cuộn ngang trong khung; "Hiển thị 4 / 4" (trước 4 / 3, lỗi fixture).
- `automation-1440`: ô nhập hết lề trái thừa; avatar kênh hiện chữ cái thật thay vì "[".
- `leads-1440`: Kanban đủ 4 cột, thẻ chi tiết nằm dưới, chỉ số không xuống dòng.
- `login-390`, `notfound-390`: tên thương hiệu và nút ngôn ngữ không xuống dòng.

**Chưa khớp / bỏ có chủ ý (QPOL1):** huy hiệu "Meta Tech Partner", "500+ shop", "98.6%", nút Google, "Ghi nhớ đăng nhập 30 ngày" (cần logic phiên), Trung tâm trợ giúp; SLA/độ chính xác AI/KPI/ảnh bài/Dừng khẩn cấp (cần dữ liệu thật — xem gap matrix). Chưa chụp được trang cần DB + phiên: onboarding, 403, Kênh, `/app/*` thật.
**Kiểm tra:** `:focus-visible` toàn cục (viền 2px token `--focus-ring`); trạng thái rỗng/lỗi/đang tải không đổi.

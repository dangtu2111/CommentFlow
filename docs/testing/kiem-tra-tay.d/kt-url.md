## KT-URL — Giao diện Báo cáo, Landing, Quyền riêng tư, Điều khoản (UI-FIDELITY-REPORTS-LEGAL, feat-ui-reports-legal)

> Chỉ đổi giao diện, không đổi logic; trang mẫu dev. / UI only; dev sample pages.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy web dev, mở /dev/ui/bao-cao ở 1440px | Đầu trang, 4 thẻ KPI, biểu đồ cột, phân bố ý định, bảng top bài viết, hiệu suất nhân viên; mọi số có nhãn [MẪU]. |
| 2 | Mở /dev/ui/landing, /dev/ui/privacy, /dev/ui/terms | Khung đầu/chân trang chung; không có huy hiệu "Meta Tech Partner", số shop, nút Google/Facebook; nội dung pháp lý ghi [MẪU]. |
| 3 | Thu cửa sổ còn 390px | Không cuộn ngang; mục lục Điều khoản xếp lên trên. |
| 4 | Chế độ tối của hệ điều hành | Chữ vẫn đọc được. |
| 5 | Chạy bản production (NODE_ENV=production) | Bốn route /dev/ui/* trả 404. |

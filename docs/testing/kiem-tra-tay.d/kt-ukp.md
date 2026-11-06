## KT-UKP — Giao diện Cơ sở kiến thức + Bài viết (UI-FIDELITY-KB-POSTS, QUKP1)

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/web dev` (cổng riêng), mở `/dev/ui/kb-posts` (bản dev). | Thẻ bài + tab nền tảng + phân trang số + panel cấu hình; mọi nội dung có nhãn [MẪU]; bản production trả 404. |
| 2 | Đăng nhập Owner, mở `/app/kb`. | Thanh "Độ đầy đủ kiến thức" = % ở trang Độ sẵn sàng; menu trái dẫn tới Nhập sản phẩm, Thử AI, Độ sẵn sàng…; Staff mở `/app/kb` nhận 404. |
| 3 | Mở `/app/posts`, bấm tab Facebook/Instagram, sang trang 2. | Danh sách lọc đúng nền tảng, số trang hiển thị "1 … 5 6 7 … n", dòng "Hiển thị a - b trên N bài đăng" đúng. |

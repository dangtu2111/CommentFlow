## POST-PUBLISHING — Bật đăng bài lên Fanpage Facebook (chủ dự án)

- **Mặc định TẮT.** Soạn và lưu nháp luôn dùng được; "Lên lịch" và "Đăng ngay" chỉ hoạt động khi bật cờ ở CẢ HAI nơi: `FB_PUBLISH_ENABLED=true` trong `.env.local` của web và của worker (khởi động lại cả hai). Worker còn cần `FB_CONNECTOR_ENABLED=true`, `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENC_KEYS`; thiếu thì worker dừng khởi động với lỗi rõ ràng (không chạy bản giả).
- **Quyền Meta `pages_manage_posts` là điều kiện bắt buộc** cho từng Fanpage (hiện đăng nhập Facebook của CommentFlow CHƯA xin quyền này, nên mọi kênh đang thiếu và bài sẽ ghi lỗi "thiếu quyền đăng bài"; giao diện cảnh báo trước khi lưu). Cách cấp:
  - **Token System User** (Page thuộc Business): khi tạo token ở Business Settings, tick thêm `pages_manage_posts`, rồi dán lại token ở Cài đặt → Kênh → khối System User và kết nối lại Page.
  - **Đăng nhập Facebook thường:** cần thêm `pages_manage_posts` vào quyền xin khi đăng nhập — việc này PHẢI làm sau khi quyền đã được thêm vào ứng dụng Meta (nếu không hộp thoại Facebook báo "Invalid Scopes" và làm hỏng đăng nhập). Chưa làm ở bản này; cần chủ dự án quyết định.
  - Khi bán cho khách thật, `pages_manage_posts` cần Advanced Access (App Review) kèm video demo.
- **Nên thử trên một Page thử** trước khi bật cho khách: đăng một bài ngắn, kiểm tra bài hiện trên Facebook và trạng thái "Đã đăng" ở Lịch.
- **Nguyên tắc an toàn đã cài sẵn:** chỉ Owner; bài chỉ đăng khi Owner bấm hoặc đến giờ đã chọn (AI không tự viết hay tự đăng); tối đa MỘT lần (kết quả không rõ → "Chưa rõ kết quả", không tự đăng lại — Owner kiểm trên Facebook); workspace đang "Dừng khẩn cấp" thì không đăng; thử lại tối đa 3 lần chỉ khi Facebook giới hạn tốc độ.
- **Chưa có:** ảnh/video/liên kết/gắn sản phẩm, Instagram/TikTok, chỉnh nội dung riêng từng kênh, AI gợi ý caption.

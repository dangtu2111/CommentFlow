## KT-WSHOP — Cơ sở kiến thức: kết nối và đồng bộ Shopify (feat-kb-shopify-connect)

> Làm ở cả `vi` và `en`. Cần: ứng dụng tạo ở Shopify Dev Dashboard (quyền `read_products`, `read_inventory`, đã phát hành phiên bản và cài vào cửa hàng cùng tổ chức); `TOKEN_ENC_KEYS` ở web và worker; worker chạy với `SHOPIFY_ENABLED=true`; đã chạy `queue:install`. Bước 1–4 làm được không cần Shopify thật.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `/app/kb`: bấm "Kết nối Shopify"; nhập tên miền `evil.com` + Client ID + secret bất kỳ | Báo "chưa hợp lệ"; vẫn "Chưa kết nối" |
| 2 | Nhập `ten-cua-hang.myshopify.com` (hoặc dán URL `https://…/admin`), Client ID, Client secret hợp lệ → Lưu | Báo "Đã lưu kết nối"; chip "Đã kết nối" + tên miền; Client secret không hiện lại ở đâu cả |
| 3 | Bấm "Đồng bộ ngay"; bấm lại ngay | Lần 1 báo đã gửi yêu cầu; lần 2 báo đợi khoảng 1 phút |
| 4 | Tắt `SHOPIFY_ENABLED` (mặc định) rồi đồng bộ, tải lại | Kết quả: "Máy chủ chưa bật đồng bộ Shopify" |
| 5 | Bật `SHOPIFY_ENABLED=true`, khởi động lại worker, đồng bộ với Client ID/secret đúng | Sau vài giây: "Lần đồng bộ gần nhất thành công: N sản phẩm, M biến thể"; số "Sản phẩm đang bán" tăng; `/app/products` có sản phẩm nguồn Shopify (giá/tồn đúng Shopify) |
| 6 | Sửa giá một sản phẩm trên Shopify rồi đồng bộ lại | Giá trong CommentFlow cập nhật; không nhân đôi sản phẩm |
| 7 | Nhập sai Client secret rồi đồng bộ | Kết quả "Shopify từ chối Client ID/secret…", chip "Cần nhập lại Client ID/secret"; nút đổi thành "Nhập lại Client ID/secret" |
| 8 | Ngắt kết nối → xác nhận | Báo "Đã ngắt kết nối"; về "Chưa kết nối"; sản phẩm đã nạp vẫn còn; `/app/activity` có dòng ngắt kết nối |
| 9 | Staff mở `/app/kb` | 404 (chỉ Owner) |
| 10 | Bấm "Đồng bộ ngay" hai lần thật nhanh (hoặc bấm đúp) | Chỉ MỘT yêu cầu được nhận; lần còn lại báo "thao tác quá nhanh" hoặc "đợi khoảng 1 phút"; hàng đợi không có hai job |
| 11 | Sai Client ID/secret rồi đồng bộ | Khối nói rõ nguyên nhân (sai cặp / khác tổ chức hoặc chưa cài / thiếu quyền / không giải mã được), không chỉ thông báo chung |
| 12 | Kiểm `docs`/log worker khi đồng bộ | Không có Client secret, token hay tên miền trong log |

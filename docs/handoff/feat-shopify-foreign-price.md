# Bàn giao `feat/shopify-foreign-price` (claude)

**Làm gì:** theo chỉ đạo 07/11 ("trả lời theo giá của thông tin, không đổi tiền tệ"), shop Shopify dùng tiền tệ khác VND (USD…) nay được lưu giá theo ĐƠN VỊ NHỎ NHẤT của tiền tệ gốc (cột mới `currency_code`, `price_minor`, `compare_at_minor` — migration 0070 + quyền theo cột 0071) và AI báo đúng như nguồn ("12.99 USD"), KHÔNG quy đổi. Quyết định: `Q-SFP1` (thay `Q-SNV1`).

**Vì sao cột riêng:** `price_vnd` giữ nghĩa "đồng" và để NULL với hàng ngoại tệ để giao diện, `sendRecheck` R5, `price-rules`, bộ chặn số tiền không hiểu nhầm cent thành đồng. Chỉ `loadTryProducts` → `productFactText` đọc cột mới.

**An toàn:** đọc số thập phân chính xác không dùng số thực; sai dạng/quá độ chính xác → không có giá. Số "quy đổi ra đồng" do AI bịa vẫn bị bộ chặn số tiền bắt (có test). **Câu báo giá ngoại tệ không tự gửi** (`foreign_price`) vì kiểm giá lúc gửi chưa đọc được loại giá này.

**Đã kiểm trên DB thật `cf_test`:** ghi USD, cập nhật giá, đổi lại VND (xóa giá ngoại tệ, đặt lại mã) — 8/8.

**Việc còn lại / cần ở PIPE-ORCHESTRATOR:** `sendRecheck` R5 + `price_snapshot` đọc giá ngoại tệ rồi mới bỏ chặn `foreign_price`; giao diện danh sách sản phẩm hiện giá ngoại tệ; Haravan/Sapo/KiotViet (VND-only) không đổi.

**Cần bạn làm:** bấm "Đồng bộ ngay" lại trên trang Shopify để nạp giá USD; hỏi giá một sản phẩm ở ô Thử AI (kỳ vọng "… USD", nút tự gửi bị chặn vì `foreign_price`).

**Cập nhật (Q-PMT1):** khi thử ô Thử AI phát hiện khớp tên sản phẩm kém với tên Shopify dài; đã sửa `searchProducts` dùng `word_similarity` (xem `q-pmt1.md`, test tích hợp trong `kb-search.int.test.ts`).

# Handoff feat/kb-shopify-connect (claude)

Đã làm (tự kiểm, chưa có kiểm chứng độc lập): kết nối Shopify bằng Client ID/secret + nạp sản phẩm/chính sách; ảnh sản phẩm (`products.image_url`, migration 0068); card Xem trước sản phẩm theo Stitch + tên loại biến thể; card Chạy thử nghiệm AI trả lời tại chỗ; ô Thử AI đọc sản phẩm/chính sách/FAQ thật (lát A+B `TRY-AI-REAL`, plan `docs/plans/feat-try-ai-real.md`).
Điều rút ra: cửa hàng thử dùng USD nên mọi giá = null (chỉ nhận VND); chính sách Shopify lưu `lang='all'`, `kind` shipping/return; bộ nhận diện/soạn câu vẫn là mock — `createLlmExtractor/createLlmDrafter` có sẵn nhưng KHÔNG nơi nào trong `apps/` gọi.
Còn lại: lát C (nối LLM thật vào ô Thử AI; cần khóa + model qua LiteLLM, trần chi phí), embedding thật, mô tả/metafield → thẻ sản phẩm (FR-058), webhook Shopify, bảng reconcile, quyết định tiền tệ USD.

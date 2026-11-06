## 2r. `POSTS-LINK-PRODUCT` (FR-061) — không cần tài nguyên ngoài
Chỉ là bảng `cf.post_products` (migration 0049) + truy vấn; không khóa/dịch vụ ngoài. Việc sinh đề xuất bằng AI (worker, cần LLM) chưa làm — cờ LLM giữ TẮT; khi làm sẽ gọi `suggestPostProducts` và vẫn cần người xác nhận.

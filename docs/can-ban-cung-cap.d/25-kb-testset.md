## 2n. `KB-TESTSET` (FR-054) — không cần tài nguyên ngoài
Bộ câu kiểm thử chạy qua pipeline Thử AI bằng mô phỏng (không LLM, không khóa, không DB). Dùng KB thật khi cờ `TRY_AI_KB_REAL` bật (cùng cờ KB-TRYAI, mặc định TẮT). Lưu bộ câu và chặn nút Xuất bản cần bảng mới (migration làn b, `KB-TESTSET-PERSIST`). Bạn **không** phải làm gì cho bản mock.

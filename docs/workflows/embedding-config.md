# Cấu hình embedding và quy tắc "không mock khi chạy"

Áp dụng cho mọi agent và mọi lệnh. Chủ dự án chốt 08/11/2026 sau sự cố: bge-m3 được bật bằng cờ truyền riêng cho lệnh `kb:reembed` còn web/worker chạy embedder mock → `kb_chunks` là bge-m3 nhưng câu hỏi dùng vector giả → nhánh vector vô nghĩa mà không ai biết.

## Quy tắc
1. **Một nguồn cấu hình:** `.env.local` + hàm `resolveEmbeddingConfig(env)` (`@flow/ai`) — web (ô Thử AI), worker (job `pipeline`, `kb-reembed`, kiểm khi khởi động) và EVAL gọi CÙNG hàm. Không nơi nào tự chọn embedder.
2. **Không đổi cho một lệnh:** không đặt `ML_EMBED_ENABLED`, model embedding hay bất kỳ cờ ảnh hưởng dữ liệu nào chỉ trong dòng lệnh/biến tạm của MỘT lệnh. Cần đổi → báo chủ dự án sửa `.env.local`, khởi động lại web/worker, rồi mới chạy lệnh.
3. **Không mock khi chạy:** thiếu `ML_EMBED_ENABLED=true` + `ML_URL` → cấu hình `off`: nhánh vector bị TẮT (chỉ toàn văn/trigram), cờ `KB_REEMBED_ENABLED=true` mà thiếu embedding thật → worker báo lỗi và không khởi động. Không có embedder/LLM/SMS giả ở web hoặc worker.
4. **Bản giả chỉ cho test tự động:** test tự cắm qua tham số; không chọn được bằng biến môi trường; `assertMockAllowed` (`@flow/shared`) báo lỗi nếu tiến trình không phải test (vitest hoặc `NODE_ENV=test`) nạp bản giả. EVAL `--backend mock` tự khai báo bằng hàm và báo cáo ghi "MOCK — không phải số đo chất lượng".
5. **Không trộn vector khác model:** tìm kiếm chỉ so vector cùng `embedding_model`; lệch model giữa cấu hình và dữ liệu → tắt nhánh vector, báo lỗi (kiểm khi khởi động web/worker và banner ô Thử AI) cho tới khi chạy lại `kb:reembed` xong (gap `EMBED-MODEL-MISMATCH-GUARD`).
6. **Mọi báo cáo EVAL ghi embedder đã dùng** (dòng "Embedder").

## Đổi model embedding (FR-133)
Sửa `.env.local` → khởi động lại → `pnpm --filter @flow/worker kb:reembed -- count <workspaceId>` → `enqueue`. Thao tác trọn vẹn (tạo lại toàn bộ, giữ bản cũ cho tới khi đếm khớp rồi mới chuyển) là gap `EMBED-REINDEX-ATOMIC`.

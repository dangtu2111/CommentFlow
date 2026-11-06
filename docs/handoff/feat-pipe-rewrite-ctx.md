# Bàn giao `feat-pipe-rewrite-ctx` (PIPE-REWRITE-CTX, FR-137/144) — agent: claude (làn a)

## Đã làm
- `packages/ai/src/rewrite/`: `rewrite-query.ts`, `customer-context.ts`, `rewriter.ts`, `rewrite-prompt.ts`, `rewrite-config.ts`, `fixture-rewriter.ts` + test cạnh file; xuất ở `index.ts`; tên biến `REWRITE_LLM_*` ở `env.example`.
- Quyết định Q-PRC1; docs: gap-matrix, MASTER, codemap, CAN_BAN_CUNG_CAP §2i, KIEM_TRA_TAY KT-033.

## Đã đọc + điều rút ra
- `Extractor`/`Drafter` là mẫu: interface + bản LLM (một `llm.call`) + bản fixture + config cờ tắt. `LlmMessage.content` bắt buộc `MaskedText`; `maskPii` ở `@flow/shared`.
- `decideAction` đã có `REPEAT_HANDOFF_THRESHOLD` (hỏi lại ≥ 3 lần) nên không làm lại ở đây.

## Còn lại
- Nối pipeline: lấy bình luận cha/caption/sản phẩm gắn bài/lượt thread/câu hỏi bài khác từ DB (đã che PII), gọi `selectCustomerContext` + `rewrite`, ghi `search_query` vào `retrieval_logs` (cần migration → làn b).
- Đưa `CustomerContext` vào prompt soạn (`draft-prompt.ts`) + "không lặp ý đã trả lời".
- Hiệu chuẩn danh sách từ chỉ định bằng bộ đánh giá (EVAL).

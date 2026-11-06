# Kế hoạch `feat-pipe-rewrite-ctx` — Viết lại câu hỏi theo ngữ cảnh + nhớ 5 lượt (PIPE-REWRITE-CTX)

## Việc

Mã gap matrix: `PIPE-REWRITE-CTX` (FR-137, FR-144) · Spec: `docs/05` FR-137/144, `docs/09` §4 (`rewriteQuery`).

**Tóm tắt:** Thêm bước `rewriteQuery` vào `packages/ai`: ghép bình luận với bình luận cha, caption bài (rút gọn) và tên sản phẩm gắn bài thành `search_query` bằng quy tắc (không tốn LLM); chỉ khi câu ≤ 6 từ hoặc nhiều nghĩa **và** chưa nhận được sản phẩm mới gọi LLM rẻ (qua `LlmClient` có sẵn, mock) để viết lại. Thêm hàm chọn ngữ cảnh khách: ≤ 5 lượt gần nhất cùng chuỗi + ≤ 3 câu hỏi của khách ở bài khác trong 7 ngày. Rủi ro: LLM viết lại sai/làm lộ PII → luôn che đầu ra, hỏng thì quay về `search_query` quy tắc.

## Điểm chưa rõ

Không có. Lựa chọn tự chốt: Q-PRC1 trong `QUYET_DINH_CHO_DUYET.md`.

## Tiêu chí nghiệm thu

1. `buildRuleQuery` ghép bình luận + cha + caption (cắt ≤ 200 ký tự) + tên sản phẩm; bỏ phần rỗng/trùng; kết quả ≤ 400 ký tự — kiểm bằng: test đơn vị FR-137.
2. `needsLlmRewrite` đúng khi (≤ 6 từ hoặc có cụm chỉ định mơ hồ) VÀ chưa có sản phẩm; sai khi đã có sản phẩm hoặc câu dài rõ nghĩa (ca biên 6/7 từ) — kiểm bằng: test đơn vị FR-137.
3. Bản LLM: không đủ điều kiện → KHÔNG gọi LLM; đủ điều kiện → ĐÚNG MỘT `llm.call` (step `rewrite`, `prompt_version`, văn bản đã che); đầu ra được che PII và cắt độ dài; đầu ra rỗng/hỏng → quay về câu quy tắc, `source='rule'`; lỗi `llm.call` ném nguyên — kiểm bằng: test đơn vị.
4. Câu gốc của khách không bị đổi (kết quả giữ nguyên `original`) — kiểm bằng: test đơn vị.
5. `selectCustomerContext`: lấy đúng ≤ 5 lượt gần nhất theo thời gian (gồm lượt shop), ≤ 3 câu hỏi khác bài trong 7 ngày (đúng 7 ngày còn tính, quá thì bỏ; bài hiện tại và bình luận tương lai bị loại), kèm mã bài — kiểm bằng: test đơn vị FR-144.
6. Bản fixture không gọi mạng/LLM; cấu hình `REWRITE_LLM_ENABLED` mặc định tắt — kiểm bằng: test đơn vị.
7. Coverage `packages/ai` không hạ — kiểm bằng: `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

Đã đọc: `packages/ai/src/{index.ts,classify/extractor.ts,classify/fixture-extractor.ts,classify/extract-prompt.ts,classify/classify-config.ts,draft/drafter.ts}`, `llm-client.ts` (kiểu), `vitest.config.ts`, docs/05 FR-137/144.

## File sẽ sửa / tạo

- `packages/ai/src/rewrite/{rewrite-query,customer-context,rewriter,fixture-rewriter,rewrite-config,rewrite-prompt}.ts` + test cạnh file (mới).
- `packages/ai/src/index.ts`: xuất API.
- `env.example`: tên `REWRITE_LLM_ENABLED`, `REWRITE_LLM_MODEL`.
- Docs: `QUYET_DINH_CHO_DUYET.md`, `gap-matrix.md`, `MASTER.md`, `codemap.md`, `CAN_BAN_CUNG_CAP.md`, `testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-pipe-rewrite-ctx.md`.

## Migration

Không có (chỉ làn b). Ghi `search_query` vào `retrieval_logs` và nối pipeline để việc sau.

## Test viết trước

Mọi file `*.test.ts` viết và chạy đỏ (module chưa có) trước khi viết mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/rewrite` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/cổng tự gửi/`sendRecheck`; PII: đầu vào bắt buộc `MaskedText`, đầu ra LLM được che lại bằng `maskPii` có sẵn, không đổi logic che).

## Rủi ro / câu hỏi cho chủ dự án

Chưa nối vào pipeline/`retrieval_logs`; "khách hỏi lại ≥ 3 lần → chuyển người" đã có ở `decideAction` (`REPEAT_HANDOFF_THRESHOLD`), không làm lại ở đây.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có (không thư viện mới; `Rewriter` có 2 bản — LLM và fixture — như `Extractor`/`Drafter`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec hoặc Q-PRC1).

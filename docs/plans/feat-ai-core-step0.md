# Kế hoạch `feat/ai-core-step0` — Bước 0 lõi AI (trước khi đánh giá model)

**Trạng thái duyệt:** Đã duyệt (chủ dự án chốt thứ tự và nội dung ở tin nhắn 07/11/2026: "Đồng ý thứ tự của bạn, bổ sung và chốt như sau… Làm liên tục, không cần hỏi lại trừ trường hợp đã quy định").

## Việc

Mã gap matrix: `PIPE-CLASSIFY-EXTRACT`, `PIPE-DRAFT`, `PIPE-GUARD-MONEY`, `PIPE-CONFIDENCE`, `KB-EMBED-LITELLM`, `PIPE-ORCHESTRATOR` (dòng mới) · Spec: `docs/09_System_Architecture.md` §4, §6.0; `docs/12` §8; FR-032, FR-140, FR-142, FR-162, FR-163.

**Tóm tắt:** Sửa các lỗi gốc của lõi AI mà lần chạy thật đầu tiên đã lộ ra, trước khi so sánh model: xác suất nhãn không còn lấy từ con số mô hình tự ghi, câu đưa vào extract/tìm kiếm được chuẩn hóa (mở viết tắt) sau khi che PII, guard kiểm đủ theo §4, JSON dùng structured output gốc, embedding dùng bge-m3 qua dịch vụ `ml` miễn phí, và ghi nhận `PIPE-ORCHESTRATOR` vào kế hoạch tổng. Rủi ro: chưa chạy với model/embedding thật (cần khóa và ~3 GB RAM); không migration.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `p_label` KHÔNG lấy từ số `confidence` mô hình tự ghi; thứ tự ml → logprob → tự nhất quán → null — kiểm bằng: `label-signal.test.ts`, `extract-result.test.ts`, `try-pipeline.test.ts`.
2. extract và tìm kiếm nhận câu đã che PII rồi chuẩn hóa; "ship bao lâu" không bị gán `price`; "gia bn sz M" → `price` + size M — kiểm bằng: test hồi quy trong `try-pipeline.test.ts`.
3. Guard kiểm ý `fact` thiếu/sai `source_ids`, ngôn ngữ, độ dài, xưng hô — kiểm bằng: `guard-reply.test.ts`.
4. LlmClient gửi `response_format` json_schema strict; schema khớp bộ đọc Zod; LiteLLM `drop_params: true`; đầu ra hỏng → Thử AI hiện "Chuyển người: AI không trả kết quả hợp lệ" (khác lỗi mạng) — kiểm bằng: `llm-output.test.ts`, `llm-client.test.ts`, `try-ai-llm.test.ts`.
5. `ml` có `POST /embed` (bge-m3, 1024 chiều, từ chối vector sai chiều, Bearer tùy chọn); client `createMlEmbedder` + cờ `ML_EMBED_ENABLED` mặc định TẮT — kiểm bằng: `pytest` ở `services/ml`, `ml-embedder.test.ts`.
6. `MASTER.md` và `gap-matrix.md` có dòng `PIPE-ORCHESTRATOR` kèm danh sách mục `*-WIRE` phụ thuộc — kiểm bằng: `pnpm docs:build`.
7. Gói `ai` giữ coverage 100% lines/functions; `pnpm precheck` xanh — kiểm bằng: lệnh đó.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/ai/src/try/try-pipeline.ts` (pipeline), `classify/extract-result.ts`, `classify/extractor.ts`, `llm-client.ts`, `draft/drafter.ts`, `normalize/normalize-lang.ts`, `services/ml/app/main.py`, `docs/09` §4/§6.0.

## File sẽ sửa / tạo

Xem commit: `classify/label-signal.ts`, `guard-reply.ts`, `llm-output.ts`, `embedding/ml-embedder.ts`, `try/demo-abbreviations.ts`, `services/ml/app/{embedding,main}.py` + test, `infra/litellm/config.yaml`, `infra/docker-compose.yml`, Dockerfile ml.

## Migration

Không có.

## Test viết trước

Hồi quy "ship bao lâu"/"gia bn sz M"; thứ tự ml→logprob→tự nhất quán; guard từng mã; schema khớp Zod; `/embed` đầu vào/đầu ra/Bearer.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/classify src/try src/guard-reply.test.ts src/llm-output.test.ts` · `cd services/ml && uv run pytest` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

Có phần chạm xử lý PII/che/guard nhưng KHÔNG đổi quyền, RLS, tự gửi hay migration: tự kiểm theo `verify.md` mục A (PII, số tiền, nguồn từng ý), gắn nhãn "tự kiểm, chưa có kiểm chứng độc lập".

## Rủi ro / câu hỏi cho chủ dự án

`ml` cần ~3 GB RAM để nạp bge-m3 (đã nâng `mem_limit` lên 3g; kiểm máy ảo/staging đủ RAM) và tải ~2,3 GB lần đầu. Embedding đổi model thì phải tạo lại embedding của KB (job `kb-reembed` có sẵn) trước khi tìm vector đúng.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Thêm thư viện `sentence-transformers` (Apache-2.0) và `torch` bản CPU (BSD-3-Clause), model `BAAI/bge-m3` (MIT): theo spec `docs/09` §2; chỉ là extra tùy chọn của `ml` nên CI Python không cài. Không vi phạm nguyên tắc nào khác.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking

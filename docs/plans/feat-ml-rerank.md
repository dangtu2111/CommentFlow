# Kế hoạch `feat/ml-rerank` — Rerank bge-reranker-v2-m3 qua ml để quyết định "đủ liên quan"

Mã gap matrix: `RETRIEVAL-GROUP-R` (phần còn lại) · Tiếp theo `fix/retrieval-group-r` (PR #285).

**Tóm tắt:** Cosine/RRF không tách được đoạn "cùng chủ đề nhưng không trả lời" (vd câu COD kéo đoạn ship). Việc này thêm `/rerank` THẬT (bge-reranker-v2-m3) vào dịch vụ ml (nạp lười, 503 khi tắt, không mock), client TS dùng chung cho web/worker/EVAL, và quyết định "đủ liên quan" bằng điểm rerank (ngưỡng hiệu chỉnh theo bộ đoạn đúng đã gán); không bật hoặc rerank lỗi → suy giảm về cosine. Nâng `mem_limit` ml lên 5 GB. Rủi ro thấp: cờ mặc định TẮT; đổi hành vi chỉ khi chủ dự án bật `ML_RERANK_ENABLED`.

## Điểm chưa rõ

Không có (yêu cầu chốt 08/11/2026: rerank ngay trước (1b), mem_limit ~5 GB, client dùng chung, ngưỡng theo bộ đoạn đúng, ghi lệnh dựng lại ml). Ngưỡng `KB_MIN_RERANK` được đặt lại sau khi chủ dự án dựng ml và tôi chạy hiệu chỉnh.

## Tiêu chí nghiệm thu

1. `/rerank` trả điểm 0..1 đúng thứ tự, 503 khi tắt/thiếu thư viện, 502 lệch số điểm, 422 vượt giới hạn, bắt buộc Bearer khi đặt token — kiểm bằng: `services/ml/tests/test_rerank.py`.
2. Client `createMlReranker` chia lô, kiểm model/độ dài/khoảng điểm, lỗi → `LLM_UNAVAILABLE` không lộ nội dung — kiểm bằng: `ml-reranker.test.ts`.
3. Điểm đoạn kiến thức = rerank khi có reranker (xếp lại top-10), lỗi → cosine + báo — kiểm bằng: `kb-try-knowledge.test.ts`.
4. Ngưỡng hiệu chỉnh theo dữ liệu thật (mẫu dương/âm) và mục tiêu tách được câu không có nguồn (COD không trả lời bằng đoạn ship) — kiểm bằng: `pnpm --filter @flow/eval run retrieval` + EVAL 3 lượt (sau khi ml được dựng).

## File sẽ đọc / sửa

`services/ml/app/{main,rerank}.py`, `infra/docker-compose.yml`, `packages/ai/src/{embedding/ml-reranker.ts,try/kb-try-knowledge.ts,try/workspace-knowledge.ts,retrieve/sources.ts}`, `apps/worker/src/{config,main,jobs/pipeline-job}.ts`, `apps/web/src/server/try-ai-{runtime,knowledge}.ts`, `tools/eval/src/{cli/retrieval,production/*,retrieval-report}.ts`, docs.

## Migration

Không có.

## Test viết trước

Endpoint `/rerank` (pytest), client TS, tích hợp vào `kb-try-knowledge`, cờ cấu hình worker.

## Cần kiểm chứng độc lập không?

Không (không đổi RLS/auth; cờ tắt mặc định).

## Rủi ro / câu hỏi cho chủ dự án

Cần chủ dự án (hoặc tôi khi được phép) bật `ML_RERANK_ENABLED=true` ở `.env.cf-dev`/`.env.local` rồi dựng lại ml — lệnh ở `docs/can-ban-cung-cap.d/ml-rerank.md`. Máy ảo cần ~2 GB RAM + ~2,2 GB đĩa thêm.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Trạng thái duyệt

Đã duyệt (yêu cầu của chủ dự án 08/11/2026).

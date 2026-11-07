# Kế hoạch `feat/da-rules-wire` — lõi cờ rủi ro dùng chung + nối DA-RULES-* + sửa ca hành động

**Trạng thái duyệt:** Đã duyệt (chủ dự án chốt 07/11/2026: "làm tiếp lõi điều phối dùng chung + nối DA-RULES-* + sửa 3 ca hành động (mơ hồ → clarify, VAT → handoff, injection → handoff), đo lại chỉ số hành động đúng bằng EVAL-RUNNER qua LiteLLM"; quy tắc migration chỉ-thêm tự merge — Q-MRG2).

## Việc

Mã gap matrix: `DA-RULES-WIRE` (mới), một phần `PIPE-ORCHESTRATOR` · Spec: FR-147, FR-160, FR-155, `docs/09` §3.4/§4.

**Tóm tắt:** EVAL-RUNNER đo thật cho thấy hành động đúng chỉ ~55% vì `runTryPipeline` truyền cờ rủi ro cố định (`false`) và chưa nối luật nào. Nhánh này gom các luật `DA-RULES-*` thành MỘT hàm dùng chung (`evaluateTurnRisks`) mà ô Thử AI gọi ngay và worker sẽ gọi sau, rồi sửa các ca hành động sai, đo lại bằng EVAL-RUNNER qua LiteLLM. Rủi ro: thêm cờ BẮT BUỘC mới cho `decideAction` (mọi nơi gọi phải truyền — hiện chỉ có pipeline).

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `evaluateTurnRisks` gom pháp lý/chèn lệnh/mạo danh/giá/tồn thành `risks` + lý do; mạo danh chỉ kiểm khi có danh tính, hỏng → nghi — kiểm bằng: `turn-risks.test.ts`.
2. Hỏi VAT không nguồn → `handoff legal_unsourced`; chèn lệnh (vi/en) → `handoff injection_suspected` — kiểm bằng: `turn-risks.test.ts`, `try-pipeline.test.ts`.
3. Hỏi giá/tồn chưa nêu sản phẩm → `clarify product_unknown`; đã nêu tên mà shop không có → `redirect`; đã nêu size → không hỏi số đo — kiểm bằng: `decide-action.test.ts`, `try-pipeline.test.ts`.
4. Ý hỏi "tồn kho" (cụm danh từ) nhận là chủ đề tồn kho — kiểm bằng: `route.test.ts`.
5. Thiếu cờ `injectionSuspected` → `input_unreadable` → chuyển người (không mở khi lỗi) — kiểm bằng: `decide-action.test.ts`.
6. Đo lại qua LiteLLM (56 mẫu synthetic): hành động đúng tăng từ 50–57%; chi phí ≤ $2/1.000 lượt; token suy luận ≈ 0 — kiểm bằng: `pnpm --filter @flow/eval evaluate --backend litellm`.
7. `pnpm precheck` xanh; gói `ai` giữ coverage 100% lines/functions.

## File sẽ đọc (≤ ~8, kèm lý do)

`try/try-pipeline.ts`, `decide/decide-action.ts`, `decide/legal-rules.ts`, `decide/impersonation-rules.ts`, `injection/injection-scan.ts`, `route/route-topics.ts`.

## File sẽ sửa / tạo

`packages/ai/src/decide/turn-risks.ts` (+test, mới), `decide/decide-action.ts` (+test), `decide/index.ts`, `try/try-pipeline.ts` (+test), `route/route-topics.ts` (+test), các test cũ có `risks` literal; `tools/eval/src/run-sample.ts` (+test fixtures: thêm `reason`, `asks`); tài liệu: `docs/workflows/finish.md`, `docs/plans/quyet-dinh/q-mrg2.md`, `q-dwr1.md`, `docs/codemap.d`, `docs/gap-matrix.md`.

## Migration

Không có.

## Test viết trước

Đỏ trước rồi mới sửa: các ca `decideAction` (product_unknown, injection, đã nêu size, đã nêu tên), `classifyAsk` ("tồn kho"…), `evaluateTurnRisks`, bốn ca pipeline.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run --coverage` · `pnpm --filter @flow/eval test` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

Có (cổng tự gửi/chuyển người là phần nhạy cảm — thêm đường chặn, không nới): tự kiểm theo `verify.md`, gắn nhãn "tự kiểm, chưa có kiểm chứng độc lập"; không tự merge nhánh loại này.

## Rủi ro / câu hỏi cho chủ dự án

Số đo trên bộ `synthetic` chỉ mang tính chỉ dẫn. Mạo danh/giá lệch caption/tồn cũ cần dữ liệu bài/Page nên chỉ nối ở worker thật.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào. Thêm cờ bắt buộc vào `decideAction` làm đổi chữ ký — mọi nơi gọi (một nơi) đã cập nhật.

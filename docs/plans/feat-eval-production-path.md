# Kế hoạch `feat/eval-production-path` — EVAL đo đúng đường production, nhiều lượt, báo cáo trung thực

Mã gap matrix: `EVAL-RELIABILITY` (mục 1–3) · Spec: `docs/testing/eval-synthetic-v2-2026-11-08.md`, KB-SYNC-DRAFT (#280/#281 đã merge).

**Tóm tắt:** Hiện EVAL tự tìm chính sách/FAQ bằng từ khóa và chạy 1 lượt/bên nên số đo dao động và không phản ánh production. Việc này cho EVAL nạp shop file vào workspace `[EVAL]` cố định (cf_dev) qua đúng đường đồng bộ → xuất bản → `loadWorkspaceKnowledge` (có vector bge-m3), chạy ≥ 3 lượt mỗi bên, báo trung bình + min/max theo nhóm, tính cổng theo lượt tệ nhất, liệt kê riêng mẫu chập chờn, ghi cấu hình (embedder, kb_version, nhiệt độ, seed). Rủi ro thấp: chỉ công cụ đo + chuyển phần lõi đồng bộ/xuất bản từ worker vào `packages/ai` để dùng chung.

## Điểm chưa rõ

Không có (yêu cầu đã chốt 08/11/2026 trong gap EVAL-RELIABILITY). Quyết định tự chọn: `[EVAL]` tự xuất bản (không cần người bấm), chỉ chạy trên `cf_dev`/`cf_test*`.

## Tiêu chí nghiệm thu

1. `runKbSync` và `runKbPublish` (lõi) nằm ở `packages/ai`, worker chỉ bọc job; mọi test hiện có của worker vẫn xanh — kiểm bằng: `pnpm --filter @flow/worker exec vitest run` + int.
2. Nạp shop file vào `[EVAL]` (sản phẩm + biến thể + chính sách + FAQ) → đồng bộ → xuất bản tạo `kb_version` và đoạn có vector bge-m3; chạy lại không đổi → không tạo phiên bản thừa — kiểm bằng: test tích hợp `tools/eval` + chạy thật.
3. `--knowledge production` chạy mẫu qua `loadWorkspaceKnowledge` (tìm lai vector + toàn văn + trigram), báo cáo ghi embedder, `kb_version`, số đoạn — kiểm bằng: chạy `evaluate` và đọc báo cáo.
4. `--repeats N` (mặc định 3): báo cáo gộp trung bình + min/max theo chỉ số và nhóm, cổng chấm theo LƯỢT TỆ NHẤT, mục riêng "Mẫu chập chờn" (kết quả khác nhau giữa các lượt) — kiểm bằng: test thuần `report-multi.test.ts`.
5. Bước extract nhiệt độ 0 và truyền `seed` (cấu hình được), ghi vào báo cáo — kiểm bằng: test client + báo cáo.
6. Bộ chạy ở CI (fixture `mock`) vẫn ghi "mock — không phải số đo chất lượng" — kiểm bằng: test hiện có.

## File sẽ đọc / sửa

Đọc: `tools/eval/src/{runner,run-sample,report,shop}.ts`, `tools/eval/src/cli/run.ts`, `apps/worker/src/jobs/{kb-sync,kb-publish}.ts`, `packages/ai/src/try/workspace-knowledge.ts`. Sửa/tạo: `packages/ai/src/kb-sync/{run-kb-sync,run-kb-publish}.ts`, worker jobs (bọc), `tools/eval/src/production/*`, `tools/eval/src/report-multi.ts`, `tools/eval/src/cli/run.ts`, `packages/ai/src/llm-client.ts` (seed), docs gap/handoff/testing.

## Migration

Không có.

## Test viết trước

Thống kê nhiều lượt (trung bình/min/max, lượt tệ nhất, mẫu chập chờn); seed trong client.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/eval exec vitest run` · `pnpm --filter @flow/ai exec vitest run src/kb-sync` · `pnpm --filter @flow/worker exec vitest run --config vitest.int.config.ts tests/kb-sync.int.test.ts`

## Cần kiểm chứng độc lập không?

Không (công cụ đo; chuyển lõi giữ nguyên hành vi, có test).

## Rủi ro / câu hỏi cho chủ dự án

Chạy thật tốn chi phí LLM ×3 lượt/bên; dùng bộ mẫu hiện có (demo-vi, sswiftly).

## Đề xuất thay đổi

Không có.

## Complexity tracking

Chuyển lõi từ worker sang `packages/ai`: có 2 nơi dùng thật (worker + EVAL) nên không vi phạm "không trừu tượng hóa sớm".

## Trạng thái duyệt

Đã duyệt (yêu cầu EVAL-RELIABILITY của chủ dự án 08/11/2026).

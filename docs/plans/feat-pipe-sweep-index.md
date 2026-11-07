# Kế hoạch `feat/pipe-sweep-index` — chỉ mục một phần cho job quét pipeline (Q-POR13)

**Trạng thái duyệt:** Đã duyệt (chủ dự án chỉ đạo 07/11/2026 sau khi duyệt #254; loại chỉ-thêm → tự merge khi CI xanh theo Q-MRG2).

## Việc

Mã gap matrix: `PIPE-ORCHESTRATOR` (hiệu năng job quét), ghi thêm gap `PIPE-MERGE-DEBOUNCE`, `E2E-WORKER`.

**Tóm tắt:** Job quét 5 phút không được quét toàn bảng bình luận khi có hàng chục nghìn bình luận backfill. Thêm chỉ mục một phần (chỉ bình luận chờ, không backfill) và viết lại thân hàm quét thành hai nhánh để dùng được chỉ mục. Rủi ro thấp: chỉ thêm chỉ mục + thay thân một hàm chỉ-đọc, cùng chữ ký/quyền/kết quả.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Kết quả đúng với ~50k bình luận backfill: trả bình luận chờ + backfill đã có lượt, KHÔNG trả backfill chưa có lượt — kiểm bằng: `pipeline-sweep-index.int.test.ts`.
2. EXPLAIN nhánh A dùng `comments_pipeline_pending_idx`, không Seq Scan; một lượt quét < 2 giây — kiểm bằng: cùng file.
3. Job quét worker giữ nguyên hành vi — kiểm bằng: `pipeline-sweep.int.test.ts`.
4. `pnpm db:check-rls` và `pnpm check:migrations` đạt; `pnpm precheck` xanh.

## File sẽ đọc / sửa

Sửa/tạo: `packages/db/migrations/0075_pipeline_sweep_index.sql` + journal, `packages/db/src/schema/cf/comments.ts` (khai báo chỉ mục), `packages/db/tests/pipeline-sweep-index.int.test.ts`; tài liệu: Q-POR13, codemap, gap-matrix.

## Migration

`0075`: `CREATE INDEX` một phần (không CONCURRENTLY như 0026/0031; bảng còn nhỏ) + `CREATE OR REPLACE FUNCTION cf.list_pending_pipeline_comments` (cùng chữ ký; REVOKE/GRANT lặp lại). Chỉ-thêm (không DROP/RENAME/đổi kiểu/đổi dữ liệu/nới RLS). Đường lùi: `DROP INDEX cf.comments_pipeline_pending_idx;` rồi chạy lại thân hàm của 0074.

## Cần kiểm chứng độc lập không?

Không (chỉ-thêm, hàm vẫn chỉ-đọc/chỉ cf_worker; `check-rls` kiểm hàm). Tự kiểm ghi ở handoff.

## Rủi ro / câu hỏi cho chủ dự án

Không.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.

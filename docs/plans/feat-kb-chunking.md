# Kế hoạch `feat-kb-chunking` — Cắt đoạn kiến thức, tiêu đề ngữ cảnh, băm nội dung, hạn hiệu lực

Mã gap matrix: `KB-CHUNKING` · Spec: FR-055, FR-130, FR-131 (`docs/05`), `docs/10_Database_Design.md` §3.4 (văn bản lập chỉ mục), §5 (bộ lọc hạn hiệu lực).

**Tóm tắt (2–3 câu):** Thêm "máy cắt đoạn" cho kiến thức: chia FAQ/chính sách/sản phẩm/văn bản tay thành các đoạn nhỏ, gắn `context_header` (nguồn › mục › tên sản phẩm) lên đầu, tính `content_hash` (dấu vân tay nội dung) để lần lập chỉ mục sau bỏ qua đoạn không đổi, và xử lý hạn hiệu lực (`valid_from`/`valid_until`, báo trước 3 ngày). Embedding đi qua giao diện `Embedder` (bản thật cắm sau, hiện chỉ có bản mock xác định) nên không gọi dịch vụ ngoài. Rủi ro thấp: không migration (cột đã có từ 0033); phần ghi DB chỉ ghi bản nháp, chỉ hệ thống (`withJob`) ghi được.

## Điểm chưa rõ

Không có. (Tự chọn phương án khuyến nghị, ghi `QUYET_DINH_CHO_DUYET.md` mã QKC1.)

## Tiêu chí nghiệm thu

1. Văn bản dài được cắt theo đoạn/câu, không đoạn nào vượt trần ký tự; văn bản ngắn giữ nguyên một đoạn; rỗng → không đoạn — kiểm bằng `packages/shared/src/kb-chunking.test.ts` (FR-055).
2. FAQ là một đoạn nguyên "Hỏi/Đáp" (không tách câu hỏi khỏi câu trả lời) — cùng test (FR-055).
3. `context_header` = nguồn › mục › tên sản phẩm (bỏ phần rỗng, giới hạn độ dài) và văn bản lập chỉ mục = `header + "\n" + content` — test (FR-130).
4. `content_hash` ổn định, đổi khi đổi header/nội dung/ngôn ngữ; kế hoạch lập chỉ mục chỉ embed đoạn mới/đổi/đổi mô hình embedding, báo đoạn bị xóa, không embed lại đoạn không đổi — `packages/ai/src/kb-indexing.test.ts` (FR-055, FR-133).
5. Embedding theo lô, đúng số lượng và 1024 chiều; bản mock xác định, không gọi mạng — test (FR-055).
6. Hạn hiệu lực: `valid_until <= valid_from` bị từ chối; đoạn hết hạn/chưa tới hạn không hợp lệ; còn ≤ 3 ngày thì "sắp hết hạn" — test (FR-131).
7. Ghi bản nháp qua `withJob`: upsert theo `(source, chunk_key)`, tính `tsv` theo `lang` (vi: `simple`+`unaccent`, en: `english`) trên `header + content`, xóa đoạn nháp không còn; workspace khác không bị ảnh hưởng — `packages/db/tests/kb-chunks.int.test.ts` (chạy ở CI; làn không có DB).
8. Truy vấn lọc hạn hiệu lực dùng lại được (`validChunkFilter`) — test tích hợp (FR-131).

## File sẽ đọc (≤ ~8, kèm lý do)

- `docs/codemap.md`, `docs/gap-matrix.md` (dòng KB-*), `docs/plans/MASTER.md` — bản đồ/trạng thái.
- `packages/db/src/schema/cf/kb.ts` — cột `kb_chunks` thật.
- `packages/db/migrations/0033_kb_schema.sql` — quyền ghi (chỉ hệ thống, UPDATE theo cột).
- `packages/ai/src/llm-client.ts`, `index.ts` — kiểu dùng chung, chưa có interface embedding.
- `packages/db/tests/kb-schema.int.test.ts` — mẫu test tích hợp.

## File sẽ sửa / tạo

- Tạo `packages/shared/src/kb-chunking.ts` (+ test) — cắt đoạn, header, hạn hiệu lực (thuần, không phụ thuộc).
- Tạo `packages/ai/src/kb-indexing.ts` (+ test) — `contentHash`, `Embedder`, `createMockEmbedder`, `embedInBatches`, `planChunkIndexing`, `buildChunkRows`.
- Tạo `packages/db/src/queries/kb-chunks.ts` (+ `tests/kb-chunks.int.test.ts`) — `upsertDraftChunks`, `deleteDraftChunksNotIn`, `validChunkFilter`.
- Sửa các `index.ts` của ba gói; `docs/codemap.md`, `gap-matrix.md`, `MASTER.md`, `QUYET_DINH_CHO_DUYET.md`, `CAN_BAN_CUNG_CAP.md`, `KIEM_TRA_TAY.md`, `docs/10` (ghi chú), handoff.

## Migration

Không có (mọi cột/CHECK/quyền đã ở 0033). Không có bảng mới.

## Test viết trước

Toàn bộ logic ở `kb-chunking.test.ts` và `kb-indexing.test.ts` viết trước, chạy thấy đỏ (module chưa có) rồi mới code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/kb-chunking.test.ts` · `pnpm --filter @flow/ai exec vitest run src/kb-indexing.test.ts` · `pnpm --filter @flow/shared test:coverage` · `pnpm --filter @flow/ai test:coverage` · `CF_LANE=b pnpm test:db` · `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` một lần (SQL ghi `kb_chunks`, `tsv`, bộ lọc hạn hiệu lực). Không chạm auth/PII/thanh toán/cổng tự gửi.

## Rủi ro / câu hỏi cho chủ dự án

- Bản embedding thật (LiteLLM `/embeddings` + ghi `ai_usage`) chưa làm: ghi gap `KB-EMBED-LITELLM`. Bản thật cần khóa/mô hình do chủ dự án cấp.
- Số tiền trong FAQ/chính sách vẫn KHÔNG là nguồn giá (nguyên tắc #4); đoạn chỉ để trả lời văn bản.

## Đề xuất thay đổi

Ghi chú vào `docs/10` §3.4: trần đoạn, định dạng `chunk_key`, công thức `content_hash` (QKC1).

## Complexity tracking

Không có. (Interface `Embedder` là ngoại lệ "connector nền tảng/LLM" của AGENTS.md; bản mock + bản thật sau này = ≥ 2 nơi dùng.)

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới" (không có bảng mới; ghi `kb_chunks` chỉ qua `withJob`)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/QKB1; ghi QKC1).

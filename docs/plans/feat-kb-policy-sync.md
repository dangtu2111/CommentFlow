# Kế hoạch `feat/kb-policy-sync` — Đồng bộ thông tin shop/chính sách/FAQ vào bản nháp kiến thức + EVAL đi đường production

Mã gap matrix: `KB-SYNC-DRAFT` (mới), `EVAL-RELIABILITY` (mục 3) · Spec: `docs/specs` (KB-CHUNKING, KB-PUBLISH-VERSION, KB-SEARCH-FTS).

**Tóm tắt:** Hiện chưa có đường production nào biến nội dung anh nhập (thông tin shop, chính sách, FAQ) thành đoạn nháp trong `kb_chunks` — chỉ `dev-seed` làm việc này. Vì vậy Shop Thử 2 có 0 đoạn và AI không có nguồn. Việc này thêm job worker "đồng bộ vào bản nháp" (cắt theo mục, nhiều nguồn, embedding thật bge-m3, quét cài lệnh), sau đó anh bấm Xuất bản như bình thường. EVAL sẽ nạp shop file vào workspace `[EVAL]` trong `cf_dev` qua đúng đường này rồi tìm bằng `loadWorkspaceKnowledge`. Rủi ro: ghi vào `kb_chunks` (bảng nhạy cảm RLS) → cần kiểm chéo nếu có migration.

## Điểm chưa rõ

Không có (chủ dự án đã trả lời 08/11/2026):

- **Quyết định 1 — mâu thuẫn:** không chặn; phát hiện bằng quy tắc (số + đơn vị cùng chủ đề). Trang Xuất bản cảnh báo nêu rõ 2 câu + nguồn. Pipeline chỉ `handoff` (lý do "Chính sách mâu thuẫn") khi đoạn dùng để trả lời thuộc nhóm mâu thuẫn của ĐÚNG chủ đề khách hỏi; câu hỏi khác trả lời bình thường.
- **Quyết định 2 — đồng bộ:** tự xếp job khi nguồn đổi (debounce ~10 giây, một lượt/workspace), chỉ ghi bản nháp; xuất bản do Owner bấm.
- **Quyết định 3 — lưu cờ:** KHÔNG thêm migration, KHÔNG ghi chú chữ: ghi có cấu trúc vào `kb_chunks.metadata` (jsonb có sẵn từ 0033, cf_app đã được GRANT UPDATE, publish sao chép nguyên `metadata`): `{conflict_group, topic, conflict_values}` tính lúc xuất bản; pipeline và trang Xuất bản đọc cùng dữ liệu.
- **Đã chốt ở tin trước (áp vào plan):** nội dung đồng bộ = 4 chính sách + mô tả sản phẩm (KHÔNG giá/tồn — giá/tồn đọc từ `products`); cắt theo mục + `context_header` + `policyKind` (topic của đoạn để tìm kiếm); trả 3–5 đoạn đa dạng nguồn, ưu tiên theo chủ đề; workspace `[EVAL]` tự xuất bản (không cần người bấm); banner "Chưa xuất bản kiến thức" khi workspace chưa có phiên bản nào.

## Tiêu chí nghiệm thu

1. Lưu một chính sách mới → job `kb-sync` tạo đoạn nháp (is_draft) cắt theo mục (`## …`), mỗi đoạn có `context_header` (nguồn › mục), embedding bge-m3 (model ghi đúng `cf.embedding_state`) — kiểm bằng: test tích hợp DB `kb-sync.int.test.ts` (embedder cắm qua DI).
2. Nhiều nguồn (shop_profile + policy + faq) ra nguồn `kb_sources` riêng, `chunk_key` ổn định; sửa 1 mục chỉ đổi đúng đoạn của mục đó (nhờ `content_hash`), xóa mục → xóa đoạn — kiểm bằng: test tích hợp.
3. Nội dung nghi cài lệnh bị gắn `injection_suspected` và bị loại ở bước xuất bản (đường sẵn có `scanInjection`) — kiểm bằng: test.
4. Hai chính sách mâu thuẫn số liệu cùng chủ đề → lúc xuất bản ghi `metadata.conflict_group/topic/conflict_values` lên đoạn; trang Xuất bản nêu 2 câu + nguồn; pipeline `handoff` "Chính sách mâu thuẫn" CHỈ khi đoạn dùng thuộc nhóm mâu thuẫn của đúng chủ đề khách hỏi, câu khác trả lời bình thường — kiểm bằng: test thuần (phát hiện) + test DB (metadata sau publish) + test pipeline.
4b. Banner "Chưa xuất bản kiến thức" hiện khi workspace chưa có phiên bản; hết khi xuất bản — kiểm bằng: test component + KT.
4c. Mô tả sản phẩm được đồng bộ KHÔNG chứa giá/tồn — kiểm bằng: test.
4d. Debounce: nhiều lần lưu trong 10 giây → đúng 1 job/workspace — kiểm bằng: test hàng đợi.
5. Không có embedding thật (thiếu ml/model) → lỗi rõ, KHÔNG sinh embedding giả, không ghi đoạn nửa vời — kiểm bằng: test DI + `assertMockAllowed`.
6. EVAL: lệnh nạp shop file vào workspace `[EVAL]` (cf_dev) qua `kb-sync` → publish → `loadWorkspaceKnowledge`; báo cáo ghi embedder + `kb_version`; chạy ≥3 lượt mỗi bên, mean + min/max, cổng theo lượt tệ nhất, liệt kê mẫu chập chờn riêng — kiểm bằng: chạy `pnpm --filter @flow/eval run evaluate` và đọc báo cáo.
7. Shop Thử 2: sau đồng bộ + Owner bấm Xuất bản, hỏi "How long until I get my order?" ra chính sách giao hàng (hết 0 đoạn) — kiểm bằng: bước thủ công KT mới.

## File sẽ đọc (≤ ~8)

- `packages/shared/src/kb-chunking.ts` — `chunkDocument`/`chunkText`.
- `packages/ai/src/kb-indexing.ts` — `buildChunkRows`, `planChunkIndexing`.
- `packages/db/src/queries/kb-chunks.ts`, `kb-content.ts` — ghi nháp, đọc chính sách/FAQ/shop.
- `apps/worker/src/jobs/kb-publish.ts` + `apps/web/src/server/kb-publish.ts` — mẫu job/enqueue.
- `tools/eval/src/*` — chỗ EVAL nạp shop file và tìm kiếm.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/kb-sync/` (thuần: tách theo mục, phát hiện mâu thuẫn) + test.
- Tạo `apps/worker/src/jobs/kb-sync.ts` + đăng ký hàng đợi `KB_SYNC_QUEUE` (`packages/shared/src/queues.ts`, `queue/definitions.ts`, `main.ts`).
- `apps/web/.../kb/actions.ts` — đẩy job sau khi lưu (theo quyết định điểm 2).
- `tools/eval` — lệnh nạp vào `[EVAL]` + chạy nhiều lượt + báo cáo mean/min/max.
- Docs: gap `KB-SYNC-DRAFT`, `docs/testing/kiem-tra-tay.d/kt-kbsync.md`, codemap.d.

## Migration

Không có (quyết định 3: dùng `kb_chunks.metadata` sẵn có).

## Lát làm (tuần tự, test trước)

1. Thuần: tách theo mục + `policyKind` + chọn đa dạng nguồn + phát hiện mâu thuẫn (`packages/ai/src/kb-sync`).
2. Job `kb-sync` + debounce + đẩy job khi lưu nguồn + sản phẩm (không giá/tồn).
3. Xuất bản ghi `metadata` mâu thuẫn + trang Xuất bản cảnh báo + banner.
4. Pipeline đọc `metadata` → handoff theo chủ đề.
5. EVAL đường production + `[EVAL]` tự xuất bản + ≥3 lượt.

## Test viết trước

Logic quy tắc: tách theo mục, phát hiện mâu thuẫn, kế hoạch đồng bộ (thêm/đổi/xóa), từ chối khi thiếu embedding thật.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/kb-sync` · `pnpm --filter @flow/worker exec vitest run --config vitest.int.config.ts tests/kb-sync.int.test.ts`

## Cần kiểm chứng độc lập không?

Có (tự kiểm theo `verify.md`, gắn nhãn; không tự merge): job ghi vào `kb_chunks` bằng `withJob`/RLS và đường embedding.

## Rủi ro / câu hỏi cho chủ dự án

Không còn thẻ. Chạy EVAL thật cần ml (bge-m3) và LiteLLM đang bật trên máy dev — đã bật.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Trạng thái duyệt

Đã duyệt (chủ dự án trả lời 3 điểm 08/11/2026).

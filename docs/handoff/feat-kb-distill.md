# Bàn giao — chuỗi `KB-DISTILL` / `GUARD-FACTS` (M0–M5, 10–11/11/2026)

Cập nhật: 11/11/2026 · Mục gap matrix: `KB-DISTILL`, `GUARD-FACTS`, `PIPE-REWRITE-NO-POST` · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-kb-distill.md`, `feat-kb-distill-m3-1.md`, `feat-kb-distill-m3-2.md`, `feat-guard-facts-t2-t4.md`, `feat-guard-facts-t1.md`, `fix-money-guard-variant-labels.md`, `fix-rewrite-no-post.md` · ADR 018.

## Đã làm (PR và trạng thái)

| PR | Nhánh | Nội dung | Trạng thái |
|---|---|---|---|
| #312 | M0 | fact plan không phụ thuộc cờ `fact_slots` | đã merge |
| #314/#315 | M2 | gap từ chuyển người, trang "Dữ liệu còn thiếu" | đã merge |
| #313 | `fix/secondary-complaint-needs-human` | nhãn phụ complaint không ép chuyển người với đổi trả thường | chờ chủ dự án merge (đã gộp main) |
| #316 | `feat/kb-distill-migration` | migration 0084 (cột FAQ nháp, `fact_topic`, trigger `faq_items_guard_publish`) | chờ chủ dự án kiểm chéo + merge |
| #317 | `feat/kb-distill-m3-1` | FAQ chỉ đọc `published`; gap ghi `fact_topic`; duyệt thẻ đóng gap theo chủ đề | xếp chồng; tự merge được khi gốc là main + CI xanh |
| #319 | `fix/money-guard-variant-labels` | số trong nhãn biến thể không tính là sai giá | chạm guard: chủ dự án kiểm chéo |
| #318 | `feat/kb-distill-m3-2` | chắt lọc → FAQ nháp, tab "Chờ duyệt", cờ `cf.ai.distill` | chờ chủ dự án |
| #320 | `feat/guard-facts-t2-t4` | cờ `cf.ai.guard_facts`: T2 thêm nguồn cùng chủ đề, T4 gọi lại khi nháp rỗng | chạm guard: chủ dự án kiểm chéo |
| #321 | `feat/guard-facts-t1` | T1 khu vực không khớp: gọi lại → hỏi khu vực; chỉ số "Sai khu vực" | chạm guard: chủ dự án kiểm chéo |
| #322 | `fix/rewrite-no-post` | viết lại câu hỏi không thêm "bài này" khi không có bài viết | tự merge sau khi #321 vào main |

Thứ tự merge: #316 → #317 → #319 → #318 → #320 → #321 (#313, #322 độc lập).

## Đã đọc và rút ra

| File | Điều cần nhớ |
|---|---|
| `packages/ai/src/pipeline/run-pipeline.ts` | T4/T1 ở sau lần soạn đầu; T2 ở khối guard tiền; mọi nhánh mới sau `input.guardFacts === true`, cờ tắt y hệt cũ |
| `packages/ai/src/try/kb-try-knowledge.ts` + `retrieve/distill-rank.ts` | đoạn FAQ chắt lọc xếp sau đoạn thô: bỏ khi đoạn nguồn có mặt (so `chunk_key`, vì xuất bản sinh mã đoạn mới), tối đa 3/10 chỗ |
| `packages/db/src/queries/kb-sync.ts` | `setDraftChunkDistillMeta` ghi `source_chunk_id`, `source_chunk_key`, `distill_kind` lên đoạn nháp mỗi lần đồng bộ |
| `tools/eval` | `--distill`, `--guard-facts`, chỉ số "Sai khu vực"; EVAL chạy nền từng bộ một (máy yếu bộ nhớ) |

## Kết quả đo (xem `docs/plans/quyet-dinh/q-kb-distill-m3-2.md`, `q-guard-facts-t2-t4.md`, `q-guard-facts-t1.md`)

- fs-m3c (2 lượt, có `--distill`): đạt cổng. fs-m3d, fs-b2, fs-b3 (1 lượt): demo đạt; sswiftly/vài nhóm lệch ĐÚNG 1 mẫu.
- Mẫu lệch lặp lại `syn2-en-06` = phương sai bước viết lại câu hỏi ("…shown in this post…"); xử lý ở #322.
- T1 không kích hoạt ở mẫu thật nào của bộ EVAL, chỉ có fixture `guard-facts-region.test.ts`.

## Bật cờ cho Shop Thử 2 (CHỜ chủ dự án đưa UUID — agent KHÔNG tự bật; không bao giờ bật cho shop thật)

Chỉ trên máy dev (`cf_dev`, `APP_ENV` khác staging/production). Thay `<UUID_SHOP_THU_2>` bằng UUID chủ dự án cung cấp:

```
pnpm flags:set -- cf.ai.distill on --workspace <UUID_SHOP_THU_2>
pnpm flags:set -- cf.ai.guard_facts on --workspace <UUID_SHOP_THU_2>
```

Điều kiện để chắt lọc chạy: worker có `LITELLM_BASE_URL`, `LITELLM_API_KEY` và `DISTILL_LLM_MODEL` (hoặc `DRAFT_LLM_MODEL`); chủ dự án sửa `.env.local` rồi khởi động lại worker (agent không đọc/ghi `.env*`). Chắt lọc tốn tiền LLM nhưng có trần 0,20 USD mỗi lần chạy và ghi `ai_usage` bước `distill`.

### Kiểm log trên worker

- Lúc khởi động: tìm dòng **`kb-distill TẮT: thiếu LITELLM_BASE_URL/LITELLM_API_KEY hoặc DISTILL_LLM_MODEL/DRAFT_LLM_MODEL`** → thiếu cấu hình, cờ bật cũng không chạy; sửa env và khởi động lại. Không thấy dòng này = bộ chắt lọc đã dựng được.
- Sau khi bấm "Đồng bộ lại từ Shopify" (hoặc đồng bộ kiến thức) của Shop Thử 2: tìm dòng **`kb-distill xong`** kèm `workspaceId` và số liệu (`considered`, `called`, `accepted`, `inserted`, `rejected`, `costUsd`). Lỗi chỉ được ghi log, không làm hỏng đồng bộ.
- Kết quả: vào `/app/kb-gaps?tab=pending` ("Chờ duyệt") của workspace đó; Owner duyệt mới đưa gợi ý vào kiến thức (job hệ thống không tự duyệt được: trigger DB chặn).
- Chạy tay một workspace dev: `pnpm --filter @flow/worker kb:distill -- <UUID>` (thêm `--approve` CHỈ cho workspace `[EVAL]`).
- `cf.ai.guard_facts`: không có log riêng; quan sát qua `Thử AI`/chẩn đoán EVAL (`guardFacts` trong kết quả) và tỉ lệ lượt gọi bộ soạn lần 2 trong `ai_usage` (`prompt_version` có hậu tố `+retry@1`).

### Cách tắt lại

```
pnpm flags:set -- cf.ai.distill off --workspace <UUID_SHOP_THU_2>
pnpm flags:set -- cf.ai.guard_facts off --workspace <UUID_SHOP_THU_2>
```

Tắt cờ: hành vi quay về y hệt cũ ngay (cờ đọc theo workspace mỗi lượt/lần đồng bộ). Gợi ý chắt lọc đã được Owner duyệt vẫn là FAQ bình thường (xóa ở mục FAQ nếu không muốn); gợi ý còn ở "Chờ duyệt" không ảnh hưởng AI.

## Còn lại (theo thứ tự)

1. Chủ dự án kiểm chéo/merge theo thứ tự trên; sau khi #321 vào main thì tự merge #322 (CI xanh).
2. Chủ dự án đưa UUID Shop Thử 2 → bật cờ theo lệnh trên, đo trên workspace đó.
3. Còn mở từ trước: bảng nhật ký audit cho thẻ chính sách; kind `processing_time` (migration); `policy_field` chắt lọc; form sửa theo Stitch; các màn KB còn lại; chủ dự án bấm "Đồng bộ lại từ Shopify" ở trang Chính sách.
4. Cân nhắc đo lặp nhiều lượt sau khi #322 vào main để xác nhận mẫu `en-06` hết dao động.

## Lệnh test liên quan

```
pnpm --filter @flow/ai exec vitest run src/pipeline src/rewrite src/retrieve src/try src/kb-sync src/kb-distill
pnpm --filter @flow/worker test:db   # kb-distill-publish.int.test.ts (cần DB test)
pnpm --filter @flow/eval exec vitest run
```

# Kế hoạch `feat-kb-testset` — Bộ câu kiểm thử kiến thức trước khi xuất bản

## Việc

Mã gap matrix: `KB-TESTSET` · Spec: docs/05 FR-054 ("bộ câu kiểm thử chạy trước xuất bản"), docs/04 US-034, docs/07 UF-8.

**Tóm tắt:** Owner viết vài câu hỏi mẫu của khách kèm kết quả mong đợi (hành động AI: trả lời / hỏi lại / chuyển hướng / chuyển nhân viên / bỏ qua; từ khóa phải có trong câu trả lời), bấm chạy để hệ thống chạy từng câu qua pipeline Thử AI (mock; KB thật khi cờ `TRY_AI_KB_REAL` bật) rồi báo đạt/không đạt từng câu và "cổng đạt/chưa đạt". Không trừ lượt gói. Bảng lưu bộ câu chưa có (migration chỉ làn b) nên **bộ câu chưa được lưu** và **chưa chặn nút Xuất bản**; phần đó ghi vào gap matrix. Rủi ro thấp: không ghi dữ liệu, không gọi dịch vụ ngoài.

## Điểm chưa rõ

Không có (xem Q-KTS1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. `parseTestCases` kiểm Zod: câu 1–1000 ký tự, hành động ∈ {answer, clarify, redirect, handoff, skip}, ≤ 5 từ khóa ≤ 100 ký tự, tối đa 20 ca; rỗng/quá nhiều/sai trả lý do + chỉ số ca — test `test-set.test.ts`.
2. `runTestSet` chạy tuần tự, so hành động thực tế (`skip` khi pipeline bỏ qua), từ khóa trong câu trả lời (không phân biệt hoa thường/dấu), và guard số tiền; lỗi một ca chỉ ghi tên lỗi, không làm hỏng ca khác — test.
3. Cổng `gate=pass` chỉ khi có ≥ 1 ca và mọi ca đạt; bộ rỗng → fail — test.
4. Server action: đầu vào sai không tốn hạn mức; hạn mức 10 lần/ngày/workspace → `limit_reached`; lỗi nguồn kiến thức → `unavailable` và log chỉ có tên lỗi — test `kb-testset.test.ts`.
5. Trang `/app/kb-testset` chỉ Owner (Staff 404, quét `requireAppUser`), workspace lấy từ phiên không từ form; menu chỉ Owner — test quét + `app-nav.test.ts`.
6. Chuỗi vi/en đủ khóa, `lint:i18n` và test khớp khóa đạt.
7. Không trừ lượt gói, không ghi DB — kiểm bằng đọc diff (không import usage-meter/`withJob`/ghi DB) và test `billed:false` của pipeline có sẵn.

## File sẽ đọc

`docs/codemap.md`, `packages/ai/src/try/try-pipeline.ts`, `demo-ai.ts` (mock), `apps/web/src/server/try-ai.ts` + `try-ai-knowledge.ts` + trang/form try-ai (mẫu), `app-nav.ts`.

## File sẽ sửa / tạo

- `packages/ai/src/try/test-set.ts` (+test) — Zod, `runTestSet`, `summarizeTestSet`; `index.ts` xuất.
- `apps/web/src/lib/kb-testset-form.ts` (+test), `kb-testset-limits.ts` — đọc ô văn bản `câu | hành động | từ khóa`.
- `apps/web/src/server/kb-testset.ts` (+test) — hành động có hạn mức, tiêm phụ thuộc.
- `apps/web/src/app/app/(guarded)/kb-testset/{page,actions}.tsx`, `components/kb-testset/{kb-testset-form,kb-testset-result}.tsx`.
- `app-nav.ts` (+test), `vi.json`/`en.json`; docs: gap-matrix, MASTER, codemap (dòng riêng), handoff, KIEM_TRA_TAY, CAN_BAN_CUNG_CAP, QUYET_DINH.

## Migration

Không có (làn d). Phần cần bảng (làn b): lưu bộ câu theo workspace (`kb_test_cases`, RLS ghi `withActor` Owner) + cột kết quả lần chạy cuối gắn `kb_versions` để chặn/cảnh báo ở nút Xuất bản — ghi gap matrix `KB-TESTSET-PERSIST`.

## Test viết trước

`test-set.test.ts` (mọi nhánh so khớp, ca biên đúng 20 ca, rỗng, Unicode/dấu, lỗi một ca), `kb-testset-form.test.ts`, `kb-testset.test.ts` (server) — viết và thấy đỏ (thiếu module) trước khi viết mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/try/test-set.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib/kb-testset-form.test.ts src/server/kb-testset.test.ts src/lib/app-nav.test.ts`

## Cần kiểm chứng độc lập không?

Không — không chạm auth/RLS/thanh toán/cổng tự gửi/`sendRecheck`/che PII (pipeline có sẵn tự che PII); trang chỉ Owner theo mẫu có sẵn, không đọc/ghi DB ngoài `KnowledgeRunner` đã được kiểm.

## Rủi ro / câu hỏi cho chủ dự án

Không chặn. Bộ câu chưa lưu + chưa chặn Xuất bản đến khi làn b thêm bảng.

## Đề xuất thay đổi

Không sửa docs/01–16.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc Q-KTS1).

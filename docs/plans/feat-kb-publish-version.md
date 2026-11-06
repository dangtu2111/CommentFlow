# Kế hoạch feat-kb-publish-version — Xuất bản / khôi phục phiên bản kiến thức

## Việc

Mã gap matrix: `KB-PUBLISH-VERSION` · Spec: FR-054, UF-8, US-035 (docs/05, docs/07 §UF-8, docs/10 §kb_versions/kb_chunks).

**Tóm tắt:** Hiện kiến thức chỉ có bản nháp (`kb_chunks` với `is_draft`). Việc này thêm luồng *Xem thay đổi → Xuất bản → Khôi phục*: xuất bản sao các đoạn nháp thành một phiên bản mới bất biến (`kb_versions`, số tăng dần); khôi phục = tạo phiên bản MỚI sao lại đoạn của phiên bản cũ (không sửa/xóa phiên bản nào). Bảng `kb_chunks` chỉ hệ thống ghi nên web chỉ xếp job `kb-publish` vào hàng đợi, worker thực hiện. Không migration. Rủi ro: không có cột "phiên bản đang chạy" nên "đang chạy" = số lớn nhất (Q-KPV1).

## Điểm chưa rõ

Không có (mọi quyết định ghi ở Q-KPV1, `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. `planKbVersion` tính đúng thêm/đổi/xóa theo `chunk_key`+`content_hash`, nhóm đổi (`faq`/`policy`/`product`/`manual`/`url`), loại đoạn nghi cài lệnh (FR-164), từ chối khi không có thay đổi — kiểm bằng `packages/shared/src/kb-publish.test.ts`.
2. Job `kb-publish` chỉ chạy khi người yêu cầu là Owner đang hoạt động; xuất bản/khôi phục idempotent (chạy lại → `no_changes`) — kiểm bằng `apps/worker/src/jobs/kb-publish.test.ts`.
3. Truy vấn DB: phiên bản mới = max+1, chỉ sao đoạn nháp không nghi cài lệnh, khôi phục sao đúng đoạn phiên bản cũ, không chạm đoạn đã xuất bản, không lẫn workspace — kiểm bằng `packages/db/tests/kb-publish.int.test.ts` (chạy ở CI/DB làn b; làn d không có DB).
4. Trang `/app/kb-publish` chỉ Owner (Staff 404), id phiên bản lạ/workspace khác → 404, hành động chỉ xếp job — kiểm bằng `apps/web/src/server/kb-publish.test.ts`, `lib/kb-publish-form.test.ts`.
5. i18n vi+en khớp khóa, không chuỗi cứng — `pnpm lint:i18n`, `apps/web/src/i18n/messages.test.ts`.
6. Mục menu "Phiên bản kiến thức" cho Owner — `lib/app-nav.test.ts`.

## File sẽ đọc

`docs/codemap.md`, `packages/db/src/schema/cf/kb.ts`, `packages/db/src/queries/kb-chunks.ts`, `apps/worker/src/jobs/hide.ts`+`run-job.ts`, `apps/worker/src/main.ts`, mẫu kb-gaps (server/trang/lib), `app-nav.ts`.

## File sẽ sửa / tạo

Tạo: `packages/shared/src/kb-publish.ts`(+test), `packages/db/src/queries/kb-publish.ts`, `packages/db/tests/kb-publish.int.test.ts`, `apps/worker/src/jobs/kb-publish.ts`(+test), `apps/web/src/server/kb-publish.ts`(+test), `lib/kb-publish-form.ts`(+test), trang+actions `app/(guarded)/kb-publish/`, `components/kb-publish/`.
Sửa: `packages/shared/src/index.ts`, `packages/db/src/runtime.ts`+`index.ts`, `apps/worker/src/queue/definitions.ts`, `apps/worker/src/main.ts`, `app-nav.ts`(+test), `i18n/messages/{vi,en}.json`, docs (gap-matrix, MASTER, codemap, KIEM_TRA_TAY, QUYET_DINH).

## Migration

Không có.

## Test viết trước

`kb-publish.test.ts` (shared) và test job worker trước khi viết mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/kb-publish.test.ts`; `pnpm --filter @flow/worker exec vitest run src/jobs/kb-publish.test.ts`; `pnpm --filter @flow/web exec vitest run src/server/kb-publish.test.ts src/lib/kb-publish-form.test.ts`.

## Cần kiểm chứng độc lập không?

Không có migration/RLS mới, nhưng chạm quyền (Owner-only, ghi `kb_chunks` qua `withJob`) và cổng đoạn nghi cài lệnh → gọi `verifier-security` một lần.

## Rủi ro / câu hỏi cho chủ dự án

Phần cần cột/bảng mới (làn b) ghi vào gap matrix: `KB-PUBLISH-POINTER` (cột "phiên bản đang chạy" để khôi phục tức thì/hoàn tác không tăng số), `KB-PUBLISH-SOURCE-SNAPSHOT` (khôi phục cả nội dung nguồn FAQ/chính sách, nếu không lần lập chỉ mục sau sinh lại nháp mới).

## Đề xuất thay đổi

Không sửa docs/01–16 ngoài ghi chú thực tế ở docs/10 (nếu cần).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định có trong spec/ADR hoặc Q-KPV1).

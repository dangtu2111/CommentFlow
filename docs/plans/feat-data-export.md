# Kế hoạch `feat-data-export` — Xuất dữ liệu workspace

## Việc

Mã gap matrix: `DATA-EXPORT` (FR-094, US-071) · Spec: `docs/09` §3.2 `privacy`/§9 (hàng đợi `privacy`), `docs/10` §3 `data_exports`, `docs/11` `POST /privacy/export`, `docs/13` §10.

**Tóm tắt:** Owner bấm "Yêu cầu xuất dữ liệu" → hệ thống tạo một yêu cầu (bảng mới `core.data_exports`) và xếp job `data-export`. Worker đọc bình luận, khách tiềm năng, kiến thức (đoạn nháp + đã xuất bản), cấu hình tự động/quy tắc lọc của workspace, **che thông tin cá nhân** rồi ghi ra một tệp JSON Lines (mỗi dòng một bản ghi, có `section`). Tệp được ghi qua interface `ExportFileStore` (bản mặc định ghi vào thư mục cục bộ, thay bằng object storage sau) và hết hạn sau 7 ngày. Mọi đường chạy thật nằm sau cờ `DATA_EXPORT_ENABLED` mặc định TẮT. Rủi ro: chính sách che PII (Q-EXP1) làm tệp ít hữu ích hơn bản đầy đủ; gửi link tải/email cần tài nguyên ngoài nên chưa làm (gap `DATA-EXPORT-DELIVERY`).

## Điểm chưa rõ

Không có (mọi điểm mơ hồ đã tự chọn phương án an toàn, ghi ở Q-EXP1).

## Tiêu chí nghiệm thu

1. Tệp xuất không chứa SĐT/email thô, tên khách, id người dùng nền tảng thô; văn bản bình luận/ghi chú/kiến thức đã `maskPii`; liên hệ khách chỉ còn 4 số cuối + cờ có email — kiểm bằng: test đơn vị `FR-094 che PII…` (shared) + test property-style quét chuỗi.
2. Mỗi dòng xuất là JSON hợp lệ có `section` ∈ {meta, comments, leads, kb_chunks, automation_settings, rules}; dòng đầu là `meta`, dòng cuối nêu số bản ghi + `truncated` — kiểm bằng: test worker với DB giả.
3. Chỉ Owner đang hoạt động yêu cầu được; Staff/người ngoài → không tạo yêu cầu; job chạy lại không xuất hai lần (trạng thái ≠ pending thì bỏ qua) — kiểm bằng: test worker + test tích hợp RLS.
4. Tối đa 1 yêu cầu đang chạy/đợi mỗi workspace và ≤ 5 yêu cầu/24 giờ — kiểm bằng: test tích hợp `data-export.int.test.ts` (chỉ chạy được khi có DB `cf_test`).
5. `core.data_exports` có RLS: workspace B không thấy/ghi được yêu cầu của A; Staff không đọc; cf_app không DELETE; chỉ hệ thống UPDATE — kiểm bằng: `pnpm db:check-rls` + test tích hợp.
6. Lỗi khi ghi tệp → trạng thái `failed` (mã lỗi, không có PII), không ném lại; yêu cầu quá hạn → `expired` và tệp bị xóa — kiểm bằng: test worker + test `retention`.
7. Cờ `DATA_EXPORT_ENABLED` TẮT (mặc định): web báo "chưa mở", worker không đăng ký hàng đợi — kiểm bằng: test cấu hình web/worker.
8. Lint, typecheck, depcruise, check:plans, test:trace, coverage `@flow/shared` giữ ngưỡng — kiểm bằng: lệnh ở mục dưới.

## File sẽ đọc

`docs/codemap.md`, `docs/gap-matrix.md` (dòng DATA-EXPORT/UI-FIDELITY-SETTINGS-PAGES), `packages/db/src/check-rls.ts` (khai báo policy), `apps/worker/src/jobs/{kb-publish,retention,run-job}.ts` (mẫu job), `apps/web/src/server/kb-publish.ts` (mẫu dịch vụ + enqueue), `apps/web/src/lib/data-privacy.ts` + `settings/privacy/actions.ts` (điểm nối), `packages/db/src/schema/cf/{comments,leads,kb,automation,spam-rules}.ts` (cột).

## File sẽ sửa / tạo

- `packages/shared/src/data-export.ts` (+test): hằng số, schema job, hàm che PII/dựng dòng xuất (logic thuần).
- `packages/db/src/schema/core/data-exports.ts`, `migrations/0055_data_exports.sql` (+meta): bảng + RLS.
- `packages/db/src/queries/data-export.ts` (+test tích hợp): tạo/liệt kê/claim/hoàn tất/hết hạn + đọc từng phần theo trang.
- `packages/db/src/check-rls.ts`: khai báo policy/NO_DELETE của bảng mới.
- `apps/worker/src/jobs/data-export.ts` (+test), `export-store.ts` (+test), `queue/definitions.ts`, `config.ts`, `main.ts`, `jobs/retention.ts`: job, kho tệp, cờ, dọn hết hạn.
- `apps/web/src/server/data-export.ts` (+test), `lib/data-privacy.ts`, `settings/privacy/actions.ts`: dịch vụ yêu cầu xuất, nối vào nút hiện có.
- `env.example`, docs (gap matrix, MASTER, codemap.d, quyet-dinh, cbcc, kiểm tay, handoff).

## Migration

`0055_data_exports.sql`: bảng `core.data_exports` (id, workspace_id, requested_by, status pending|running|ready|failed|expired, file_key, size_bytes, row_counts jsonb, error_code, expires_at, ready_at, created_at, updated_at); chỉ mục duy nhất một yêu cầu đang hoạt động/workspace; RLS: SELECT Owner hoặc hệ thống; INSERT Owner (chỉ cột workspace_id, requested_by; `requested_by` = người dùng hiện tại); UPDATE chỉ hệ thống; không DELETE. Đường lùi: `DROP TABLE core.data_exports` + lùi `check-rls.ts` (mất lịch sử yêu cầu; tệp trong kho tự hết hạn).

## Test viết trước

`packages/shared/src/data-export.test.ts` (che PII từng trường, ca biên, rỗng, Unicode, dòng meta/tổng kết, hạn dùng); `apps/worker/src/jobs/data-export.test.ts` (không phải Owner, chạy lại, lỗi ghi tệp, cắt ở trần dòng); `apps/web/src/server/data-export.test.ts` (cờ tắt, trùng yêu cầu, giới hạn ngày).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/data-export.test.ts` · `pnpm --filter @flow/worker exec vitest run src/jobs/data-export.test.ts src/jobs/retention.test.ts` · `pnpm --filter @flow/web exec vitest run src/server/data-export.test.ts` · `CF_LANE=b pnpm test:db` · `pnpm db:check-rls` · `pnpm --filter @flow/shared test:coverage`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration/RLS) và `verifier-security` (che PII, quyền Owner, tệp chứa dữ liệu khách). Một lần ở cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

Không chặn. Q-EXP1: tệp xuất che PII (không có SĐT/email đầy đủ, tên khách). Muốn bản đầy đủ liên hệ cho Owner phải có quyết định riêng (giải mã `LEADS_ENC_KEYS` + luật 91/2025 cần luật sư xác nhận). Gửi link tải/email: chờ SMTP + object storage (`DATA-EXPORT-DELIVERY`).

## Đề xuất thay đổi

`docs/10` §3 `data_exports`: thêm cột `size_bytes`, `row_counts`, `error_code`, `ready_at`; trạng thái `pending|running|ready|failed|expired` (ghi ở Q-EXP1). Hàng đợi đặt tên `data-export` (docs/09 §9 gộp trong `privacy`).

## Complexity tracking

Interface `ExportFileStore` khi mới có 1 bản thật + 1 bản giả cho test: ngoại lệ "tài nguyên ngoài sau interface" của AGENTS.md (object storage chưa có). Không thêm thư viện.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR hoặc ghi ở Q-EXP1).

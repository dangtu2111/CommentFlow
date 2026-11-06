# Kế hoạch `feat-retrieval-log` — RETRIEVAL-LOG (nhật ký tìm kiếm + `kb_gaps`)

Mã gap matrix: `RETRIEVAL-LOG` (MASTER) · Spec: FR-134 (+ FR-141 phần ghi `kb_gaps`, FR-136/137 cột `route`/`search_query_masked`), US-106, `docs/10` §3.3 (`retrieval_logs`, `kb_gaps`), `docs/11` (`/kb/gaps`, `/kb/retrieval-logs`).

**Tóm tắt:** Thêm hai bảng: `retrieval_logs` (mỗi lần AI tìm kiến thức ghi lại ứng viên, điểm từng nhánh, đoạn được dùng, sản phẩm nhận được — để ô "Thử AI", đo recall) và `kb_gaps` ("câu khách hỏi mà AI chưa trả lời được", gộp theo chủ đề + sản phẩm, đếm số lần). Chỉ phần dữ liệu + hàm ghi/đọc + dọn 90 ngày; giao diện (`KB-GAPS-UI`) và nối vào pipeline (`PIPE-RETRIEVE`) là việc sau. Rủi ro: bảng có nội dung khách → nội dung luôn qua `maskPii`, ghi chỉ từ job hệ thống, nên cần `verifier-db` một lần. Không gọi LLM/embedding nên không cần interface mock mới.

## Điểm chưa rõ

Không có (mọi quyết định tự chọn, ghi ở `QUYET_DINH_CHO_DUYET.md` mã Q-RL1).

## Tiêu chí nghiệm thu

1. `buildRetrievalLogRecord` che PII lần nữa cho `query`/`search_query`, cắt độ dài, giới hạn ≤ 50 ứng viên và ≤ 20 đoạn đã dùng, loại trùng id, từ chối route/lang lạ và độ trễ âm — `packages/shared/src/retrieval-log.test.ts` (FR-134).
2. `buildKbGapRecord` nhận đúng 7 chủ đề, che PII mẫu câu hỏi, cắt độ dài, từ chối chủ đề lạ — `retrieval-log.test.ts` (FR-134, FR-141).
3. Ghi `retrieval_logs` chỉ từ job hệ thống (`withJob`): `cf_app` web (withActor/withWorkspace trần) INSERT bị chặn; không UPDATE/DELETE — `packages/db/tests/retrieval-log.int.test.ts` + `pnpm db:check-rls`.
4. Workspace B không đọc/ghi được nhật ký và `kb_gaps` của A; thành viên đọc được của workspace mình; người ngoài không đọc — int test.
5. `recordKbGap` gộp theo (workspace, chủ đề, sản phẩm): lần đầu tạo `count=1`, lần sau `count+1`, `last_seen_at` mới, giữ `first_seen_at`; sản phẩm null gộp chung một dòng; 20 lệnh song song → `count = 20` — int test.
6. Gặp lại gap đã `resolved` → mở lại (`open`); `ignored` giữ nguyên nhưng vẫn đếm — int test.
7. Thành viên đổi được `status`/`resolved_by_source_id` (resolve/ignore) nhưng KHÔNG sửa được `count`/`last_seen_at`/mẫu câu hỏi (trigger), không INSERT/DELETE — int test.
8. `purge_expired_retrieval_logs(90)` xóa nhật ký cũ hơn 90 ngày, giữ mới; chỉ ngữ cảnh trần; số ngày < 1 bị từ chối — int test; job `runRetention` gọi thêm hàm này — `apps/worker/src/jobs/retention.test.ts`.
9. Công cụ xanh: `pnpm lint && lint:i18n && typecheck && depcruise && check:plans && check:migrations && test:trace`, `test:coverage` của `shared`/`ai`, `CF_LANE=b pnpm test:db`, `db:check-rls`.

## File sẽ đọc

Đã đọc: `docs/workflows/{feature,finish}.md`, `docs/testing/STANDARD.md`, `docs/10` mục `retrieval_logs`/`kb_gaps`, migration `0036`/`0034`/`0039` (mẫu RLS + trigger + ghi chú), `check-rls.ts` (danh sách), `retention.ts` (db + worker), `decide-action.ts` (`KB_GAP_TOPICS`), `ai-usage.ts` (mẫu schema).

## File sẽ sửa / tạo

- `packages/shared/src/retrieval-log.ts` (+ test, export ở `index.ts`) — logic thuần: dựng bản ghi nhật ký/gap đã che PII, hằng `KB_GAP_TOPICS`/`KB_GAP_STATUSES`/`RETRIEVAL_ROUTES`.
- `packages/ai/src/decide/decide-action.ts` — dùng `KB_GAP_TOPICS` từ `@flow/shared` (một nguồn), vẫn re-export.
- `packages/db/src/schema/cf/retrieval.ts` (+ export) — bảng `retrieval_logs`, `kb_gaps`.
- `packages/db/migrations/0040_retrieval_logs_kb_gaps.sql` (+ `meta/`) — bảng, RLS, quyền, trigger, hàm dọn.
- `packages/db/src/retrieval-logs.ts` (+ export ở `runtime.ts`/`index.ts`) — `insertRetrievalLog`, `listRetrievalLogs`, `recordKbGap`, `listKbGaps`, `setKbGapStatus`, `purgeExpiredRetrievalLogs`.
- `packages/db/src/check-rls.ts` (+ test) — policy, NO_DELETE, cột cấm GHI.
- `packages/db/tests/retrieval-log.int.test.ts` — tích hợp.
- `apps/worker/src/jobs/retention.ts` (+ test) — gọi hàm dọn 90 ngày.
- `docs/10` (ghi chú cột/quyền), `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/handoff/feat-retrieval-log.md`.

## Migration

`0040_retrieval_logs_kb_gaps.sql` (làn b): `cf.retrieval_logs`, `cf.kb_gaps` (+ RLS, index, trigger, hàm). Chi tiết ở đầu file migration. Đường lùi: `DROP FUNCTION cf.purge_expired_retrieval_logs(integer); DROP TABLE cf.kb_gaps, cf.retrieval_logs;` + lùi `check-rls.ts` và job dọn (mất nhật ký/gap đã ghi; dữ liệu suy ra được, không phải nguồn sự thật).

## Test viết trước

`retrieval-log.test.ts` (che PII, ranh giới 50/20, route/chủ đề) viết và chạy ĐỎ trước `retrieval-log.ts`; `retrieval-log.int.test.ts` viết trước migration (ca đua 20 song song, chéo workspace, mở lại gap, trigger, dọn 90 ngày).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/retrieval-log.test.ts` · `pnpm --filter @flow/worker exec vitest run src/jobs/retention.test.ts` · `CF_LANE=b pnpm test:db` · `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

**Có** — migration + RLS + trigger + hàm DEFINER (`verifier-db`, một lần). Không chạm auth/token/chữ ký/cổng tự gửi nên bỏ `verifier-security`.

## Rủi ro / câu hỏi cho chủ dự án

- Chưa có nơi gọi ghi nhật ký (chờ `PIPE-RETRIEVE`/`PIPE-GUARD`): ghi gap `RETRIEVAL-LOG-WIRE`. Xóa bản sao khi bình luận bị xóa (`REDACT-COPIES-MISSING`): bảng có cột `comment_id` để xóa trắng sau, hàm xóa chưa nối ở đây.
- `retention` chạy mỗi giờ; bảng lớn → xóa theo lô (đã giới hạn mỗi lần).

## Đề xuất thay đổi

`docs/10`: thêm cột `comment_id` (truy vết/xóa theo bình luận) vào `retrieval_logs`; `kb_gaps` thêm `id`, `updated_at`; ghi quyền ghi.

## Complexity tracking

Không có (không thư viện mới; chuyển `KB_GAP_TOPICS` về `shared` để một nguồn, vì `db` cần mà không được import `ai`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

Policy GHI: `retrieval_logs` — chỉ INSERT từ hệ thống (`withJob`), không UPDATE/DELETE cho `cf_app`. `kb_gaps` — INSERT/ghi đếm chỉ hệ thống; thành viên (Owner+Staff) UPDATE riêng `status`/`resolved_by_source_id` (trigger chặn cột đếm); không DELETE.

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định có trong spec hoặc ghi ở Q-RL1).

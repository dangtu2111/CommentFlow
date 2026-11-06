# Kế hoạch `feat/bulk-actions` — Hành động hàng loạt trong inbox

## Việc

Mã gap matrix: `BULK-ACTIONS` · Spec: FR-045 (docs/05), US-010, docs/08 (phím tắt), ADR 009 (ẩn).

**Tóm tắt:** Cho nhân viên tick nhiều bình luận trong danh sách rồi bấm **Bỏ qua**, **Ẩn** (có hộp xác nhận) hoặc **Đổi nhãn**. Không có "Gửi hàng loạt". Ẩn đi qua đúng đường yêu cầu ẩn hiện có (`requestCommentHide`, từng bình luận một, worker ẩn thật; AI không có đường vào). Bỏ qua/Đổi nhãn dùng quyền UPDATE sẵn có của thành viên trên `cf.comments` (trigger 0027 đã cho phép `status → skipped`, `label` với `label_source='human'`) — **không cần migration**. Rủi ro: ẩn nhầm nhiều bình luận (giảm bằng hộp xác nhận + server bắt buộc cờ `confirmed`), bình luận bị đồng nghiệp khóa (bỏ qua, báo số lượng).

## Điểm chưa rõ

Không có. (Tự chọn khuyến nghị, ghi `QUYET_DINH_CHO_DUYET.md` QB1–QB4: bộ nhãn, trần 50 bình luận/lần, phím tắt, bình luận bị khóa.)

## Tiêu chí nghiệm thu

1. Bỏ qua hàng loạt: chỉ đổi bình luận ở trạng thái "của người" sang `skipped`; trạng thái khác (đã gửi, đang gửi, đã ẩn…), đã xóa, khóa còn hạn của người khác bị bỏ qua và đếm riêng — kiểm bằng test tích hợp `comment-bulk.int.test.ts` + test đơn vị `bulk-action.test.ts`.
2. Đổi nhãn hàng loạt: ghi `label`, `label_source='human'`, `labels` một phần tử; nhãn ngoài danh sách bị từ chối trước khi đụng DB — kiểm bằng cùng test.
3. Ẩn hàng loạt: server từ chối nếu thiếu `confirmed === true`; mỗi bình luận gọi `requestCommentHide` riêng + đẩy job `hide` riêng, một cái lỗi không chặn các cái khác; kết quả tổng hợp theo lý do — kiểm bằng `bulk-action.test.ts`.
4. Test 404 chéo workspace: id của workspace khác → `not_found`/không bị đổi, không lộ tồn tại — kiểm bằng `comment-bulk.int.test.ts` (Bỏ qua + Đổi nhãn) và đường ẩn giữ nguyên kiểm của hàm DB.
5. Mọi Server Action mới gọi `requireAppUser` — kiểm bằng `require-app-user.scan.test.ts` (đã quét toàn khu `/app`).
6. Không có đường gửi hàng loạt và AI không gọi ẩn: không action nào gọi `requestCommentReply`; mô-đun ẩn hàng loạt chỉ nhận lệnh từ Server Action — kiểm bằng test đơn vị (deps không có `reply`) + review.
7. Giao diện: ô tick từng dòng, thanh hành động hiện khi có chọn, hộp xác nhận cho Ẩn, thông báo kết quả; chuỗi i18n vi+en khớp khóa — `pnpm lint:i18n` + `messages.test.ts`.
8. Phím tắt: `X` chọn/bỏ chọn dòng đang trỏ, `J/K` đổi dòng, `H` mở xác nhận ẩn khi có chọn, `Esc` bỏ chọn; bỏ qua khi đang gõ trong ô nhập hoặc có phím bổ trợ — kiểm bằng `bulk-shortcuts.test.ts`.
9. Cổng công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace (FR-045, US-010 có test mang mã).

## File sẽ đọc (đã đọc)

`migrations/0019`, `0027` (quyền + trigger), `queries/comment-lock.ts` (mẫu UPDATE), `server/hide-action.ts` + test (mẫu), `comments/actions.ts`, `inbox-list.tsx`, `comments/page.tsx`, `require-app-user.scan.test.ts`.

## File sẽ sửa / tạo

- `packages/shared/src/comment-labels.ts` (+ export ở `index.ts`) — bộ nhãn chuẩn dùng chung (web, sau này worker phân loại).
- `packages/db/src/queries/comment-bulk.ts` (+ export `runtime.ts`) — `skipComments`, `relabelComments`: một UPDATE có điều kiện, trả id đã đổi.
- `apps/web/src/lib/bulk-input.ts` — kiểm đầu vào (UUID, tối đa 50, khử trùng, nhãn).
- `apps/web/src/lib/bulk-shortcuts.ts` — hàm thuần ánh xạ phím → lệnh.
- `apps/web/src/server/bulk-action.ts` — logic Bỏ qua/Ẩn/Đổi nhãn với phụ thuộc tiêm vào.
- `apps/web/src/app/app/(guarded)/comments/actions.ts` — thêm 3 Server Action.
- `apps/web/src/components/comments/{bulk-selection,bulk-bar}.tsx`, `inbox-list.tsx`, `styles/globals.css`, `messages vi/en`.
- `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/codemap.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/handoff/feat-bulk-actions.md`.

## Migration

Không có. (Nếu sau này cần ghi `action_logs` cho Bỏ qua/Đổi nhãn → cần hàm DEFINER mới; ghi vào gap `BULK-ACTIONS-LOG`.)

## Test viết trước

`bulk-input`, `bulk-action` (cổng xác nhận, gom kết quả, lỗi từng phần), `bulk-shortcuts`, `comment-bulk.int` (DB thật).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/bulk-input.test.ts src/lib/bulk-shortcuts.test.ts src/server/bulk-action.test.ts src/server/require-app-user.scan.test.ts src/i18n` · `pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/comment-bulk.int.test.ts` (cần máy phụ).

## Cần kiểm chứng độc lập không?

Có — diff chạm đường ẩn (ADR 009, "AI không tự ẩn") và quyền ghi `cf.comments`: một lần `verifier-security`.

## Rủi ro / câu hỏi cho chủ dự án

Bỏ qua/Đổi nhãn hiện chưa ghi `action_logs` (cần migration). Phím tắt `E`/`M` của docs/03 chưa rõ nghĩa → chưa làm.

## Đề xuất thay đổi

Không sửa spec. Đề xuất: làm rõ nghĩa phím `E`/`M` ở docs/08.

## Complexity tracking

Không có (không thư viện mới; `comment-labels` trong `shared` có ≥ 2 nơi dùng: web + test, worker phân loại sẽ dùng — ngoại lệ `saas-core`/dùng chung theo AGENTS).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự chọn khuyến nghị theo AGENTS.md § Quy tắc hỏi; ghi `QUYET_DINH_CHO_DUYET.md` QB1–QB4).

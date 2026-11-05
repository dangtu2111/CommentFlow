# Kế hoạch `feat-send-hide-sweep` — SEND-SWEEP + HIDE-SWEEP

## Việc

Mã gap matrix: `SEND-SWEEP`, `HIDE-SWEEP` · Spec: ADR 008 (`docs/decisions/008-tra-loi-binh-luan-outbox.md`), ADR 009 §3 · docs/09 §6.1 (`sendRecheck`).

**Tóm tắt:** Thêm một job quét định kỳ trong worker, tìm các yêu cầu gửi trả lời / ẩn bình luận bị kẹt (`queued` quá lâu vì đẩy job lỗi mà bù hủy cũng lỗi; `sending` quá hạn thuê vì worker chết giữa chừng) rồi xử lý lại **qua đúng đường có kiểm trước** (`processSendJob`: R1–R3 + "kiểm trước khi gửi lại"; `processHideJob`: H1–H3), không gửi/ẩn thẳng. Vì worker chạy ở ngữ cảnh không thuộc workspace nào nên cần một hàm DB (hàm DEFINER — chạy với quyền chủ bảng; chỉ `cf_worker` gọi được, chỉ ĐỌC, chỉ trả id) để liệt kê. Rủi ro: gửi trùng nếu quét tranh với job thật — chặn bằng khóa dòng + thời hạn thuê sẵn có.

## Điểm chưa rõ

Không có (mọi điểm tự chọn phương án khuyến nghị, ghi ở `QUYET_DINH_CHO_DUYET.md` mã QSW1).

## Tiêu chí nghiệm thu

1. Hàm DB `cf.list_stuck_outbox` chỉ chạy được từ kết nối `cf_worker` ở ngữ cảnh trần; `cf_app`/ngữ cảnh workspace/người dùng bị từ chối; chỉ trả `workspace_id` + id (không nội dung) — kiểm bằng: `packages/db/tests/stuck-outbox.int.test.ts`.
2. Liệt kê đúng: `queued` cũ hơn ngưỡng, `sending` cũ hơn ngưỡng thuê; KHÔNG trả dòng còn mới hoặc đã kết thúc; có giới hạn số dòng; đúng với cả hai loại (`reply`, `hide`) — cùng test trên.
3. Quét gửi: yêu cầu `queued` kẹt được xử lý lại qua `processSendJob` (R1–R3 vẫn áp dụng: bình luận đã ẩn/kênh hết kết nối → hủy/thất bại, KHÔNG gọi connector); `sending` hết thuê → kiểm `fetchComments` trước, đã đăng thì ghi `sent` không gửi lần hai — kiểm bằng: `apps/worker/tests/sweep.int.test.ts` (connector giả).
4. Quét ẩn: tương tự với `processHideJob` (H1–H3, đã ở trạng thái đích → `done` không gọi) — cùng test.
5. Job quét: chạy theo chu kỳ (fake timers), không chạy chồng lượt, lỗi một yêu cầu KHÔNG chặn các yêu cầu khác và KHÔNG ném ra, log chỉ có mã (không nội dung), bỏ qua yêu cầu đang bay (không ngủ chờ) — kiểm bằng: `apps/worker/src/jobs/sweep.test.ts`.
6. `pnpm db:check-rls` đạt; `pnpm test:db` đạt; coverage `@flow/db` không giảm.

## File sẽ đọc

`apps/worker/src/jobs/{send,hide,retention}.ts`, `apps/worker/src/main.ts`, `packages/db/migrations/{0027,0030}*.sql`, `packages/db/src/{retention,runtime}.ts`, `apps/worker/tests/send.int.test.ts` (mẫu).

## File sẽ sửa / tạo

- `packages/db/migrations/0031_stuck_outbox_sweep.sql` (+ `meta/`): hai chỉ mục một phần + hàm `cf.list_stuck_outbox`.
- `packages/db/src/schema/cf/comment-{replies,hides}.ts`: khai chỉ mục (khớp migration).
- `packages/db/src/stuck-outbox.ts` + export ở `runtime.ts`: lớp gọi hàm.
- `apps/worker/src/jobs/sweep.ts` (+ `sweep.test.ts`), `apps/worker/tests/sweep.int.test.ts`, `packages/db/tests/stuck-outbox.int.test.ts`, `packages/db/src/stuck-outbox.test.ts` (nếu cần cho coverage).
- `apps/worker/src/main.ts`: đăng ký job quét.
- Docs: gap-matrix, MASTER, codemap, KIEM_TRA_TAY (KT), QUYET_DINH (QSW1), handoff.

## Migration

`0031_stuck_outbox_sweep`: `CREATE INDEX comment_replies_stuck_idx ON cf.comment_replies (updated_at) WHERE status IN ('queued','sending')` và tương tự `comment_hides_stuck_idx`; `CREATE FUNCTION cf.list_stuck_outbox(p_kind text, p_queued_after_seconds int, p_sending_after_seconds int, p_limit int)` DEFINER, `search_path` cố định, kiểm ngữ cảnh trần + `session_user = 'cf_worker'`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO cf_worker` (mẫu 0030 `read_channel_token`). Không đổi bảng/policy/dữ liệu. Đường lùi: `DROP FUNCTION cf.list_stuck_outbox(text,int,int,int); DROP INDEX cf.comment_replies_stuck_idx, cf.comment_hides_stuck_idx;` (lùi worker trước).

## Test viết trước

`sweep.test.ts` (đơn vị, fake timers), `sweep.int.test.ts` và `stuck-outbox.int.test.ts` viết trước mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/worker exec vitest run src/jobs/sweep.test.ts` · `CF_LANE=b pnpm test:db` · `pnpm --filter @flow/db test:coverage`.

## Cần kiểm chứng độc lập không?

Có: `verifier-security` (đường gửi/ẩn, quyền hàm DEFINER) + `verifier-db` (migration/hàm/chỉ mục) — một lần ở cuối.

## Rủi ro / câu hỏi cho chủ dự án

Không có câu hỏi. Rủi ro: ngưỡng quét (300 giây `queued`, 150 giây `sending`) có thể cần chỉnh khi chạy thật — đều là hằng số.

## Đề xuất thay đổi

Không đổi ADR.

## Complexity tracking

Không có. (Không thêm thư viện; gọi thẳng `processSendJob`/`processHideJob` thay vì thêm job pg-boss trung gian — phương án "đẩy lại vào pg-boss" đã loại vì thêm job trùng và khó kiểm bằng fake timers.)

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới" (không có bảng mới)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong ADR 008/009 và QSW1).

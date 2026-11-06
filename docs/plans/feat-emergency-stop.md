# Kế hoạch `feat-emergency-stop` — Dừng khẩn cấp tự gửi theo workspace

## Việc

Mã gap matrix: `EMERGENCY-STOP` · Spec: FR-073, US-043, `docs/09` §6 (cổng 1) + §6.1 (R4), `docs/13` §3.1 (Owner + Staff bật, chỉ Owner bật lại).

**Tóm tắt:** Nút "Dừng khẩn cấp" chặn mọi tự gửi của một workspace ngay lập tức và hủy các câu AI đang chờ trong khoảng trễ. Làm phần logic thuần (ai được bấm, bấm lặp lại an toàn, bật lại chỉ Owner) + cổng lưu trạng thái (interface + bản bộ nhớ) + dịch vụ phối hợp hủy hẹn giờ; chưa có giao diện (đợt UI) và chưa ghi cột `workspaces.emergency_stopped_at` thật (cf_app chưa có quyền ghi cột — cần migration, làn b). Rủi ro: dừng đã đặt cờ mà hủy hẹn giờ lỗi → cờ vẫn có hiệu lực, `sendRecheck` R4 chặn ở phút chót.

## Điểm chưa rõ

Không có. (Quyết định tự chọn: `docs/plans/quyet-dinh/q-es1.md`.)

## Tiêu chí nghiệm thu

1. Owner và Staff được Dừng; vai trò khác/không hợp lệ → `forbidden` — test `FR-073 decideEmergencyChange`.
2. Chỉ Owner được Bật lại; Staff → `forbidden` — test.
3. Dừng lần hai không đổi `stoppedAt`/người dừng (`already_stopped`); Bật lại khi chưa dừng → `not_stopped` — test + property-based.
4. Dừng đặt cờ TRƯỚC rồi hủy mọi hẹn giờ của workspace (lý do `emergency_stop`), không đụng workspace khác — test với `createInMemoryAutoSendDelayScheduler`.
5. Hủy hẹn giờ lỗi → cờ vẫn đặt, kết quả báo `cancelFailed` (không nuốt lỗi, không hoàn tác cờ) — test.
6. Bật lại không hồi sinh câu đã hủy — test.
7. `isEmergencyStopped(state)` nuôi đúng `workspace.emergencyStopped` của `decideAutoSend` (kết quả `hold` `emergency_stopped`) và của `sendRecheck` R4 — test tích hợp hai hàm thuần.
8. Property: với dãy Dừng/Bật lại ngẫu nhiên của các vai trò, trạng thái dừng ⇔ lần đổi hợp lệ cuối là Dừng; Staff/viewer không bao giờ làm một workspace từ dừng sang chạy.
9. Coverage `packages/ai` không giảm ngưỡng — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`docs/09` §6/6.1, `docs/13` §3.1 (đã đọc) · `packages/ai/src/delay/delay-scheduler.ts` (interface) · `automation/settings-store.ts` (mẫu store) · `history/mark-wrong.ts` (mẫu quyết định theo vai trò).

## File sẽ sửa / tạo

Tạo `packages/ai/src/emergency/{emergency-stop.ts,emergency-store.ts,emergency-service.ts,index.ts}` + test; thêm một dòng `export * from './emergency';` vào `packages/ai/src/index.ts`; `docs/codemap.d/…`, `docs/plans/quyet-dinh/q-es1.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-es.md`, `docs/can-ban-cung-cap.d` không cần (không tài nguyên ngoài); sửa dòng `EMERGENCY-STOP` ở `MASTER.md`/`gap-matrix.md` + thêm dòng `EMERGENCY-STOP-WIRE`.

## Migration

Không có (chỉ làn b). Phần DB (`workspaces.emergency_stopped_at` + GRANT cột/hàm DEFINER chỉ Owner/Staff, cột người dừng, `automation_events`) ghi vào gap matrix `EMERGENCY-STOP-WIRE` — xem `WS-OWNER-COLUMNS`.

## Test viết trước

Toàn bộ logic quy tắc ở trên: test đỏ trước, rồi mã tối thiểu.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/emergency`

## Cần kiểm chứng độc lập không?

**Có** — chạm cổng tự gửi/phân quyền: `verifier-security` một lần cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

Không có việc chỉ chủ dự án làm được. Bản bộ nhớ chỉ cho test/mock (một tiến trình).

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có (interface store có 2 nơi dùng: bản bộ nhớ + bản DB sau này, đúng ngoại lệ `saas-core`/connector tương tự các store hiện có).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec docs/13 §3.1 + Q-ES1).

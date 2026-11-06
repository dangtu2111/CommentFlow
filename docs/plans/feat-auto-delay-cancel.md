# Kế hoạch `feat-auto-delay-cancel` — Khoảng trễ trước khi tự gửi, có nút Hủy

## Việc

Mã gap matrix: `AUTO-DELAY-CANCEL` · Spec: FR-071 (khoảng trễ), US-042 (Staff hủy câu AI sắp gửi), `docs/09` §6.1 (dòng "Hủy trong khoảng trễ…").

**Tóm tắt:** Khi cổng tự gửi cho phép gửi, câu không đi ngay mà chờ 0/1/2/5 phút (cài ở ma trận tự động). Trong lúc chờ, nhân viên bấm Hủy hoặc Sửa thì câu **không** được gửi và quay về "Chờ duyệt"; Dừng khẩn cấp hủy mọi câu đang chờ. Làm phần thuần (máy trạng thái của bộ hẹn giờ) + interface hẹn giờ + bản bộ nhớ; chưa nối hàng đợi pg-boss/DB (cần cột/bảng → làn b). Rủi ro chính: hủy trễ một nhịp so với lúc gửi — nên chỉ cho hủy khi `now < runAt`, còn lại `sendRecheck` (R1/R4) là lớp thứ hai.

## Điểm chưa rõ

Không có. (Quyết định tự chọn ghi ở `docs/plans/quyet-dinh/q-adc1.md`.)

## Tiêu chí nghiệm thu

1. `planAutoSendDelay` chỉ nhận trễ trong {0,60,120,300} giây; `runAt = now + trễ`; đầu vào hỏng → lỗi `invalid_input`, không ném — test `FR-071 planAutoSendDelay`.
2. Hủy khi còn chờ (`now < runAt`) thành công với lý do `staff_cancel`/`staff_edit`/`emergency_stop`/`ai_paused`; câu quay về chờ duyệt (`hold_review`, `staff_edit` → `edit`) — test `US-042`.
3. Hủy khi đã đến hạn/đã gửi/đã hủy → `too_late`/`already_cancelled`, không đổi trạng thái; hủy chéo workspace → `not_found` — test `US-042`.
4. Trễ 0 giây: không có cửa sổ hủy (đến hạn ngay) — test.
5. Bộ hẹn giờ chỉ giao câu `due` đúng một lần (không gửi đôi) và không bao giờ giao câu đã hủy; Dừng khẩn cấp hủy mọi câu đang chờ của workspace đó, không đụng workspace khác — test + property-based (fast-check, đã có trong repo).
6. Property: với mọi dãy hành động ngẫu nhiên (hủy/tiến thời gian/giao), một câu bị giao ⇒ không từng bị hủy, và không giao trước `runAt`.
7. Coverage `packages/ai` không giảm ngưỡng — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`docs/09` §6.1 (đã đọc) · `packages/ai/src/automation/settings.ts` (`DELAY_SECONDS_OPTIONS`) · `settings-store.ts` (mẫu interface + bản bộ nhớ) · `packages/ai/src/index.ts` (export).

## File sẽ sửa / tạo

- `packages/ai/src/delay/auto-send-delay.ts` — máy trạng thái thuần (plan/cancel/resolve/dispatch).
- `packages/ai/src/delay/delay-scheduler.ts` — interface `AutoSendDelayScheduler` + bản bộ nhớ (đồng hồ tiêm vào).
- `packages/ai/src/delay/*.test.ts` — test ví dụ + property-based.
- `packages/ai/src/index.ts` — export.
- `docs/gap-matrix.md`, `docs/plans/MASTER.md` (dòng của việc), `docs/codemap.d/mien-packages-ai-src-delay.md`, `docs/plans/quyet-dinh/q-adc1.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-auto-delay-cancel.md`.

## Migration

Không có. Lưu hẹn giờ bền (bảng/cột `scheduled_send_at`/job pg-boss `send` với `startAfter`) → ghi vào gap matrix là `AUTO-DELAY-WIRE` (làn b + nối pipeline).

## Test viết trước

Toàn bộ test ở `packages/ai/src/delay/` viết và chạy đỏ trước khi có mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/delay`

## Cần kiểm chứng độc lập không?

Có, một lần `verifier-security` — chạm cổng tự gửi (hủy/không hủy được câu sắp gửi, cô lập workspace).

## Rủi ro / câu hỏi cho chủ dự án

Không có câu hỏi. Chưa nối hàng đợi thật nên chưa có hiệu lực trên staging.

## Đề xuất thay đổi

Không đổi `docs/01–16`.

## Complexity tracking

Không có (interface hẹn giờ có 2 nơi dùng: bản bộ nhớ + bản pg-boss sau này/test; thư viện không thêm).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR; lựa chọn phụ ghi Q-ADC1).

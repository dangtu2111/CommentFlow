# Kế hoạch `feat-da-holder` — Người đang giữ chuỗi: AI không chen (FR-154)

## Việc

Mã gap matrix: `DA-HOLDER` · Spec: FR-154, US-110 (`docs/05`, `docs/04`), `docs/09` §6 mục 6.

**Tóm tắt:** Khi nhân viên đã trả lời trong cùng chuỗi trong 2 giờ gần nhất (Owner chỉnh số phút), AI chỉ được gợi ý, không tự gửi. Cổng tự gửi `decideAutoSend` đã có cờ `flags.humanHolding` nhưng chưa có hàm tính cờ đó; việc này thêm hàm thuần `evaluateHumanHold` tính từ danh sách tin trong chuỗi. Rủi ro: tính sai làm AI chen vào chuỗi người đang trả lời — nên mọi lỗi/đầu vào hỏng đều thiên về "đang giữ" (chặn).

> Ghi chú: lời giao việc ghi "giữ hàng/đặt cọc"; mã `DA-HOLDER` trong MASTER/spec là FR-154 (người giữ chuỗi). Làm theo spec/MASTER; "giữ hàng/đặt cọc → chuyển người" là phạm vi khác (không có mã riêng; ghi gap `DA-DEPOSIT-RULES`).

## Điểm chưa rõ

Không có (xem Q-DH1 ở `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Chỉ tin `by:'staff'` tính; AI/khách/Page khác không — `human-hold-rules.test.ts`, property-based.
2. Mới nhất ≤ `holdMinutes` (mặc định 120) → `holding`, `heldUntil` đúng; đúng biên nhả — test biên.
3. `holdMinutes` hợp lệ 0..1440 (0 = Owner tắt); giá trị lạ → mặc định, không tắt ngầm.
4. Đầu vào hỏng/thời điểm tương lai → `holding` (chặn); không bao giờ ném — property `fc.anything()`.
5. Đơn điệu: thêm tin nhân viên / tăng số phút không bao giờ làm mất trạng thái giữ; thứ tự tin không ảnh hưởng.
6. Coverage `packages/ai` không dưới ngưỡng; `pnpm test:trace` có FR-154.

## File sẽ đọc

`decide/order-hours-rules.ts` (mẫu), `decide/index.ts`, `gate/auto-send-gate.ts` (cờ `humanHolding`, chỉ grep), `handoff-rules.ts`.

## File sẽ sửa / tạo

- tạo `packages/ai/src/decide/human-hold-rules.ts` + `.test.ts`; sửa `decide/index.ts`
- docs: plan, quyết định (`q-dh1.md`), codemap fragment, KT (`kt-dh.md`, `tt-dh.md`), gap-matrix, MASTER, handoff

## Migration

Không có. Nối dữ liệu thật (đọc tin nhân viên trong chuỗi, cột `human_hold_minutes` của `automation_settings`) → gap `DA-HOLDER-WIRE` (làn b/pipeline).

## Test viết trước

Toàn bộ `human-hold-rules.test.ts` (đỏ trước khi có file nguồn), kèm fast-check.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/decide/human-hold-rules.test.ts`

## Cần kiểm chứng độc lập không?

Có — nuôi cờ của cổng tự gửi: một lần `verifier-security`.

## Rủi ro / câu hỏi cho chủ dự án

Nơi gọi phải xác định đúng `by:'staff'` (tin do người thật gửi qua app, không phải do AI gửi) — sai nhận diện làm AI bị coi là nhân viên (chặn thừa, an toàn) hoặc ngược lại (cần kiểm ở `DA-HOLDER-WIRE`).

## Đề xuất thay đổi

Không sửa `docs/01–16`.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: quyết định đã có trong FR-154; chi tiết Q-DH1)

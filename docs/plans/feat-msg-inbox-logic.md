# Kế hoạch `feat-msg-inbox-logic` — MSG-INBOX logic hội thoại (FR-047)

Mã gap matrix: `MSG-INBOX` (phần logic) · Spec: FR-047, US-020–023, docs/09 §6 cổng 11 + §6.1 R8, docs/12 §1.

**Tóm tắt:** Thêm phần "bộ não" của hộp thư tin nhắn dưới dạng hàm thuần + interface + bản bộ nhớ, dựa trên bảng hội thoại đã có (`msg-store`): quyền gửi theo cửa sổ (AI chỉ trong 24 giờ; sau đó chỉ nhân viên kèm thẻ HUMAN_AGENT; quá 7 ngày khóa), tối đa lượt AI, chuyển người (khách hỏi lại ≥ 3 lần/đòi gặp người), hàm chọn trạng thái hiển thị, khóa chống hai nhân viên xử lý cùng lúc, và cầu nối sang `sendRecheck` (R8). Không giao diện, không migration; chưa nối DB/job. Rủi ro thấp vì chưa có đường gọi trong pipeline.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn, ghi Q-MIL1).

## Tiêu chí nghiệm thu

1. AI chỉ gửi được khi cửa sổ `open`, AI bật, hội thoại `open`, còn lượt AI; ngoài 24 giờ AI bị từ chối — test `FR-047 quyền gửi`.
2. Nhân viên: `open` → gửi không thẻ; `human_only` → bắt buộc thẻ `HUMAN_AGENT`; `closed` (>7 ngày/chưa có tin khách) → từ chối — test + biên ±1 ms.
3. Quyền gửi của inbox khớp R8 của `sendRecheck` với mọi thời điểm (property-based, fast-check) — test property.
4. Hàm chọn trạng thái hiển thị đúng thứ tự ưu tiên, tổng (mọi đầu vào → đúng một trạng thái) — test + property.
5. Chuyển người khi `repeatCount ≥ 3` hoặc đòi gặp người; dữ liệu hỏng → chuyển người — test.
6. Khóa người xử lý: người thứ hai bị từ chối khi khóa còn hạn; hết hạn thì nhận; cùng người gia hạn; chỉ chủ khóa nhả; khóa chứa `workspace_id`; lỗi store → từ chối (đóng) — test (+ ca đua hai yêu cầu cùng lúc trên store bộ nhớ).
7. `pnpm --filter @flow/ai test:coverage`, lint, typecheck, depcruise, precheck xanh.

## File sẽ đọc

`conversation-window.ts` (đã đọc), `recheck/send-recheck.ts` (R8), `schema/cf/conversations.ts` (cột), `ratelimit/send-rate-counter.ts` (mẫu store + CAS), `vitest.config.ts` (ngưỡng).

## File sẽ sửa / tạo

Tạo `packages/ai/src/inbox/{inbox-policy.ts,inbox-claim.ts,index.ts}` + test cùng thư mục; sửa `packages/ai/src/index.ts` (một dòng export), `packages/ai/vitest.config.ts` (thêm glob `src/inbox/*.ts` 95% nhánh); docs: `docs/codemap.d/mien-packages-ai-src-inbox.md`, `docs/plans/quyet-dinh/qmil1.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-msg-inbox-logic.md`, `docs/can-ban-cung-cap.d/`(không cần: không tài nguyên ngoài), dòng MSG-INBOX trong gap-matrix/MASTER, handoff.

## Migration

Không có. Phần cần bảng (cột/bảng lưu khóa người xử lý, `repeat_count`, ghi `ai_turns` từ pipeline) ghi vào gap `MSG-INBOX-WIRE` (làn b).

## Test viết trước

Toàn bộ test trong tiêu chí 1–6 viết trước, chạy thấy đỏ (module chưa có), rồi mới code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/inbox` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có, một lần `verifier-security` (cổng gửi/R8, quyền AI).

## Rủi ro / câu hỏi cho chủ dự án

Mặc định: tối đa lượt AI = 5 (tham số, cấu hình sau), thời hạn khóa người xử lý 2 phút có gia hạn — ghi Q-MIL1, đổi được.

## Đề xuất thay đổi

Không đổi docs/01–16.

## Complexity tracking

Không có (không thêm thư viện; interface store có ≥ 2 cài đặt khi nối DB — theo mẫu `ratelimit`, ngoại lệ chấp nhận được như store hiện có).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: quyết định nằm trong spec/Q-MIL1)

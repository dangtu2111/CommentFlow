# Kế hoạch `feat-admin-send-lock` — ADMIN-SEND-LOCK (FR-116)

## Việc

Mã gap matrix: `ADMIN-SEND-LOCK` · Spec: FR-116, US-084, `docs/09` §6.1 R3 + §11.

**Tóm tắt:** Admin nền tảng (không phải Owner/nhân viên) có thể tạm khóa gửi theo workspace hoặc theo Page, có thời hạn và lý do hiển thị được. Khóa chặn mọi lần gửi (cổng tự gửi cổng 1 và `sendRecheck` R3) nhưng vẫn nhận bình luận. Khóa theo Page xét theo `(platform, external_id)` xuyên workspace để nối lại cùng Page ở workspace khác không lách được (gap `SEND-LOCK-CROSS-WORKSPACE`). Làn này chỉ làm logic thuần + interface + bản bộ nhớ; bảng lưu khóa cần migration (làn b) nên ghi gap `SEND-LOCK-WIRE`. Chưa làm giao diện.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn, ghi Q-ASL1).

## Tiêu chí nghiệm thu

1. Chỉ quản trị nền tảng theo docs/13 §3.2 (`super`: workspace + kênh; `support`: chỉ kênh; `finance`: không) khóa/mở khóa được; Owner/nhân viên/vai trò lạ/thiếu → từ chối, không ghi gì — test `send-lock.test.ts` (authorize) + property-based.
2. Khóa bắt buộc có thời hạn (> hiện tại, ≤ 30 ngày) và lý do hợp lệ; đầu vào hỏng → từ chối, không ném — test.
3. `findActiveSendLock`: khóa workspace chặn mọi Page của workspace đó; khóa Page chặn theo `(platform, externalId)` ở MỌI workspace; hết hạn/đã mở khóa → không chặn; workspace khác không bị ảnh hưởng — test + property-based.
4. Danh sách khóa không đọc được → coi là đang khóa (thiên về chặn) — test.
5. `decideAutoSend`: `sendLock.locked` → `hold` gate:1 `admin_send_locked`; `sendLock = null` (đọc lỗi) → `send_lock_unknown`; không truyền → hành vi cũ — test `auto-send-gate.test.ts`.
6. `sendRecheck`: R3 trượt với `admin_send_locked`/`send_lock_unknown` ở cả `human` và `auto`, action `channel_error`; khóa không bị bỏ qua bởi bất kỳ chế độ nào — test `send-recheck.test.ts`.
7. Dịch vụ: khóa/mở khóa ghi nhật ký + báo Owner đúng một lần; lý do hiển thị (`describeSendLock`) không lộ danh tính Admin — test service.
8. Công cụ: `pnpm lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `test:trace`, `--filter @flow/ai test:coverage` xanh.

## File sẽ đọc

`packages/ai/src/recheck/send-recheck.ts`, `packages/ai/src/gate/auto-send-gate.ts` (đã đọc), `packages/ai/src/abuse/abuse-sink.ts` (mẫu interface + bản bộ nhớ), `docs/plans/quyet-dinh/q-abj1.md`, `docs/gap-matrix.md`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/send-lock/{send-lock.ts,send-lock-service.ts,index.ts}` + test; sửa `packages/ai/src/index.ts` (1 dòng export).
- Sửa `gate/auto-send-gate.ts` (+test, +index nếu cần), `recheck/send-recheck.ts` (+test, +index).
- Docs file riêng: `docs/plans/quyet-dinh/q-asl1.md`, `docs/codemap.d/mien-packages-ai-src-send-lock.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-asl.md`, `docs/can-ban-cung-cap.d/` không cần (không tài nguyên ngoài); dòng gap-matrix + MASTER.

## Migration

Không có (chỉ làn b). Bảng `send_locks` + hàng quyền ghi vai trò Admin → gap `SEND-LOCK-WIRE`.

## Test viết trước

Toàn bộ tiêu chí 1–7 viết test đỏ trước (có fast-check cho quyền, khớp phạm vi, thời hạn).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/send-lock src/gate src/recheck`

## Cần kiểm chứng độc lập không?

Có — chạm cổng tự gửi, `sendRecheck`, phân quyền → `verifier-security` một lần.

## Rủi ro / câu hỏi cho chủ dự án

Trường `sendLock` ở đầu vào cổng/recheck để TÙY CHỌN (không truyền = cũ) vì worker `send.ts` chưa có nguồn đọc khóa; khi nối DB (`SEND-LOCK-WIRE`) phải truyền bắt buộc và đổi thành trường bắt buộc. Hiện chưa có chỗ nào lưu khóa nên chưa thể có khóa thật.

## Đề xuất thay đổi

Không đổi docs/01–16.

## Complexity tracking

Interface `SendLockStore`/`SendLockEffects`: có 2 nơi dùng (bản bộ nhớ + bản DB sẽ nối) — theo mẫu `AbuseSink`. Không vi phạm khác.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi Q-ASL1).

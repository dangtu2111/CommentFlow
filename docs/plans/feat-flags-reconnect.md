# Kế hoạch `feat-flags-reconnect` — LISTEN của feature flag tự nối lại

## Việc

Mã gap matrix: `FLAGS-RECONNECT` · Spec: `docs/09_System_Architecture.md` §10 (FR-117).

**Tóm tắt:** Hiện nếu kết nối nghe `NOTIFY flags_changed` (LISTEN: kênh Postgres báo "flag vừa đổi") bị đứt thì tiến trình không nghe nữa, flag chỉ tươi theo cache 30 giây và không ai biết. Việc này làm `createFlags` tự nối lại với thời gian chờ tăng dần (lùi dần, tối đa 60 giây), báo cảnh báo qua callback khi mất/nối lại, và xóa cache sau khi nối lại (có thể đã lỡ thông báo). Rủi ro thấp: chỉ đổi `flags.ts`, không migration.

## Điểm chưa rõ

Không có (xem Q-FR1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Kết nối LISTEN lỗi → gọi `listen` lại sau 1s, 2s, 4s… tối đa 60s — kiểm bằng test fake timers.
2. Mỗi lần mất/nối lại thất bại/nối lại được đều gọi `onListenEvent` (cảnh báo) với lần thử và độ trễ — test.
3. Nối lại được → cache bị xóa, đếm lùi về 1s cho lần mất sau — test.
4. Lỗi ở `start()` ban đầu không ném; tự thử lại như trên — test.
5. `stop()` hủy hẹn giờ, không nối lại nữa — test.
6. Nhiều lỗi liên tiếp của cùng một kết nối chỉ hẹn một lần nối — test.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/saas-core/src/flags/flags.ts`, `flags.test.ts`, `packages/db/src/client.ts` (chữ ký `listen`).

## File sẽ sửa / tạo

`flags.ts` (backoff + sự kiện), `flags.test.ts` (test mới), `docs/09` §10 (một dòng), gap-matrix, MASTER, codemap, handoff, `QUYET_DINH_CHO_DUYET.md`, `KIEM_TRA_TAY.md`.

## Migration

Không có.

## Test viết trước

Mục "Tiêu chí nghiệm thu" 1–6, vitest fake timers, `FR-117` trong tiêu đề.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/saas-core exec vitest run src/flags/flags.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/cổng gửi; chỉ vòng đời kết nối).

## Rủi ro / câu hỏi cho chủ dự án

Không. Hạ tầng gom cảnh báo (log/Sentry) nối callback sau, ở nơi tạo `createFlags`.

## Đề xuất thay đổi

Thêm vào docs/09 §10 dòng "Mất LISTEN".

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định theo spec/Q-FR1).

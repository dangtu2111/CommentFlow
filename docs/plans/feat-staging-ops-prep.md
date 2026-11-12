# Kế hoạch `feat/staging-ops-prep` — STAGING-DB-MARKER và QUEUE-PROD-INSTALL: code còn thiếu + tài liệu việc của chủ dự án

## Việc

Mã gap matrix: STAGING-DB-MARKER, QUEUE-PROD-INSTALL (Phần 4e; chủ dự án 12/11/2026: "code + tài liệu, lệnh chủ dự án phải chạy ghi vào `docs/can-ban-cung-cap.d/`").

**Tóm tắt (2–3 câu dễ hiểu):** Khi kiểm thì phần lớn code của hai mục đã có (chốt chặn dấu `cf.env=staging`, đường cài hàng đợi staging có cổng xác nhận). Phần còn thiếu là: thu hồi quyền ghi sổ phiên bản `pgboss.version` của role ứng dụng (code, có test) và ghi rõ hai việc chỉ chủ dự án làm được (đặt dấu DB staging; duyệt workflow cài lên staging). Agent KHÔNG chạy gì lên staging/production.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. `cf_app` đọc được `pgboss.version` nhưng không INSERT/UPDATE/DELETE được (42501), vẫn có DML trên bảng job; toàn bộ test tích hợp worker (198) vẫn xanh.
2. `docs/can-ban-cung-cap.d/staging-db-marker.md` và `queue-prod-install.md` nêu lệnh/bước chủ dự án phải làm, vì sao agent không làm được, cách kiểm.
3. Gap matrix và `STAGING_SETUP.md` khớp thực tế (danh sách hàng đợi lấy từ `definitions.ts`).

## File sẽ đọc / sửa

Sửa: `apps/worker/src/queue/install.ts`, `docs/gap-matrix.md`, `docs/STAGING_SETUP.md`. Thêm: `apps/worker/tests/queue-privileges.int.test.ts`, hai file `docs/can-ban-cung-cap.d/`.

## Migration

Không (thu hồi quyền nằm trong bước cài hàng đợi, không phải migration schema ứng dụng).

## Test viết trước

`queue-privileges.int.test.ts` (đỏ trước khi REVOKE; mỗi câu chạy trong giao dịch rồi ROLLBACK).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/worker test:db`.

## Cần kiểm chứng độc lập không?

Tự kiểm theo `verify.md` mục B: chỉ THU HẸP quyền (không nới RLS/quyền), không đổi bảng/dữ liệu ứng dụng, chạy ở bước cài của cf_owner; cf_app không còn quyền ghi `pgboss.version` (đúng nguyên tắc ít quyền). Không thuộc diện DỪNG (không DROP/RENAME/đổi kiểu/nới RLS). Nhãn: "tự kiểm, chưa có kiểm chứng độc lập".

## Rủi ro / câu hỏi cho chủ dự án

Nếu một bản pg-boss mới cần cf_app ghi `pgboss.version` khi chạy (không thấy ở bản đang dùng, worker `migrate:false`), job sẽ báo lỗi quyền — hoàn tác bằng cách bỏ dòng REVOKE rồi cài lại.

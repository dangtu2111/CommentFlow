# Kế hoạch `feat-auth-2fa-recovery` — Khôi phục 2FA khi mất điện thoại

## Việc

Mã gap matrix: `AUTH-2FA-RECOVERY` · Spec: `docs/13` §2, ADR 003/004 §4 (FR-001).

**Tóm tắt:** Khi mất cả điện thoại lẫn mã dự phòng, người dùng cần cách lấy lại tài khoản mà kẻ chiếm mật khẩu không lợi dụng được. Làm phần logic thuần (máy trạng thái + dịch vụ qua interface, kho lưu trong bộ nhớ để thử): yêu cầu → xác minh email → chờ 72 giờ (hoặc quản trị viên duyệt sớm) → nhập lại mật khẩu để hoàn tất → tắt 2FA + đăng xuất mọi phiên; email báo kèm liên kết hủy; mọi bước ghi kiểm toán; có giới hạn tốc độ. Rủi ro: chưa có bảng lưu bền (cần migration của làn b) và chưa có giao diện. Đăng nhập bằng mã dự phòng đã có sẵn (`verifyLogin kind='backup'`).

## Điểm chưa rõ

Không có (tự chọn phương án an toàn, ghi QRCV1).

## Tiêu chí nghiệm thu

1. Yêu cầu khôi phục luôn trả "accepted" dù email có tồn tại/bật 2FA hay không (không lộ tài khoản) — test đơn vị.
2. Token chỉ lưu dạng băm; dùng sai/hết hạn/đã dùng bị từ chối — test + property.
3. Không hoàn tất được trước hạn chờ trừ khi quản trị viên khác duyệt (không tự duyệt cho mình; người không phải admin bị từ chối) — test + property thời gian đơn điệu.
4. Hoàn tất cần đúng mật khẩu; sai mật khẩu không tiêu token; đúng → tắt 2FA, xóa mọi phiên, gửi email báo — test.
5. Hủy bằng liên kết hủy chặn mọi bước sau — test.
6. Giới hạn tốc độ cho yêu cầu và hoàn tất — test.
7. Mọi chuyển trạng thái ghi kiểm toán không chứa email/token/IP — test.
8. Chuyển trạng thái nguyên tử (hai lần hoàn tất song song chỉ một thành công) — test.

## File sẽ đọc

`auth/two-factor.ts`, `auth/revoke.ts`, `ratelimit/limiter.ts`, `package.json` saas-core (đã đọc).

## File sẽ sửa / tạo

- `packages/saas-core/src/auth/recovery/{phase,service,memory-store,types,index}.ts` + test
- `packages/saas-core/src/ratelimit/limiter.ts` (thêm 2 hành động `recovery`, `recoveryComplete`) · `auth/index.ts` (export)
- Docs bằng file riêng: quyết định `qrcv1.md`, `codemap.d`, KT, gap matrix/MASTER (dòng của việc), handoff.

## Migration

Không (làn b). Bảng `core.two_factor_recovery_requests` (id, user_id, verify_hash, cancel_hash, status, created_at, verify_expires_at, release_at, approved_by, approved_at, completed_at) chỉ `cf_auth` truy cập (RLS như `two_factors`) — ghi vào gap matrix; `RecoveryStore` có hàm `transition` so-sánh-rồi-đặt cho bản DB.

## Test viết trước

Toàn bộ `*.test.ts` của `recovery/` (đỏ trước), gồm fast-check cho `recoveryPhase`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/saas-core exec vitest run src/auth/recovery src/ratelimit` · `pnpm --filter @flow/saas-core test:coverage`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (auth/2FA). Không có migration nên không cần `verifier-db`.

## Rủi ro / câu hỏi cho chủ dự án

Số 72 giờ chờ, 1 giờ hiệu lực link, 7 ngày hoàn tất là mặc định (hằng số). Thời gian phản hồi giữa "có tài khoản" và "không có" chưa cân bằng tuyệt đối (bản nối nên gửi thư ở nền).

## Đề xuất thay đổi

Không đổi docs/01–16.

## Complexity tracking

Không có (interface kho/mailer/audit có ≥ 2 cài đặt: bộ nhớ + DB sau; mock + SMTP).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi QRCV1).

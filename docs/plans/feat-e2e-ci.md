# Kế hoạch `feat-e2e-ci` — E2E trên CI xanh (E2E-CI)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: chỉ cập nhật tài liệu theo nguyên nhân gốc đã được sửa và đã merge; không đổi hành vi, không có điểm chưa rõ).

## Việc

Mã gap matrix: `E2E-CI` · Spec: `docs/testing/STANDARD.md` (E2E), FR-001 (2FA).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Job E2E trên CI từng đỏ ở bước bật 2FA. Điều tra theo kỹ năng systematic-debugging cho thấy nguyên nhân gốc đã được sửa ở `fix/2fa-backup-codes` (đã vào `main`); job E2E hiện xanh 6/6 ca. Việc còn lại là ghi đúng nguyên nhân gốc và đóng mục trong gap matrix/MASTER — không retry, không skip.

**Nguyên nhân gốc (bằng chứng):** sau `confirmTwoFactorAction` plugin xoay phiên và `applyCookies` đặt cookie mới, nhưng Next dựng lại trang `/app/security` trong cùng request mà `headers()` vẫn mang cookie CŨ (phiên đã bị xóa) → trang `redirect('/login')` → `/login` chuyển người đã có phiên mới sang `/app`; nên không bao giờ thấy tiêu đề mã dự phòng. Giả thuyết cũ trong gap matrix ("Server Action đặt cookie làm Next dựng lại trang" / "cổng 2FA redirect") đúng một phần nhưng nguyên nhân thật là đọc cookie phiên cũ. Sửa gốc: commit `3896ea3` — `requestContext()` dựng header Cookie từ `cookies()` hiện tại (`apps/web/src/lib/cookie-header.ts`, test `cookie-header.test.ts`).

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Job `e2e` của `ci.yml` xanh với 6 ca (vi+en) trên `main`/nhánh đã merge `main` — kiểm bằng: `gh run view` run 42147969146 ("6 passed")
2. Không có retry/skip che lỗi trong `e2e/playwright.config.ts` và `ci.yml` — kiểm bằng: grep `retries|skip|fixme`
3. Gap matrix + MASTER ghi đúng nguyên nhân gốc, trạng thái Xong — kiểm bằng: đọc dòng `E2E-CI`; `pnpm check:plans`

## File sẽ đọc (≤ ~8, kèm lý do)

`e2e/support/flows.ts` (chỗ đỏ), `apps/web/src/app/app/security/actions.ts`, `apps/web/src/components/security/two-factor-card.tsx`, `docs/handoff/fix-2fa-backup-codes.md`, log CI.

## File sẽ sửa / tạo

`docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/handoff/feat-e2e-ci.md`, plan này.

## Migration

Không có.

## Test viết trước

Không có logic mới; test hồi quy đã có (`cookie-header.test.ts` + kịch bản E2E bật 2FA là test thường trực).

## Lệnh test phạm vi hẹp

`pnpm check:plans`

## Cần kiểm chứng độc lập không?

Không (chỉ tài liệu; diff auth gốc đã qua verifier ở nhánh `fix/2fa-backup-codes`).

## Rủi ro / câu hỏi cho chủ dự án

Chưa chạy E2E cục bộ (không Docker); bằng chứng là log CI.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới

# Bàn giao — nhánh `feat/bulk-actions`

Cập nhật: 05/11/2026 · Mục gap matrix: BULK-ACTIONS · Agent vừa làm: claude (làn c) · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-bulk-actions.md`

## Đã làm
- Bỏ qua / Đổi nhãn / Ẩn (xác nhận) hàng loạt, không migration; phím tắt X/J/K/H/Esc; i18n vi+en; test đơn vị + test tích hợp (viết, chưa chạy được ở làn này).

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `migrations/0027_comment_hides.sql` | Trigger cho người dùng: `status` chỉ → `skipped/pending_review/needs_human` từ `new/pending_review/needs_human/send_failed/skipped/spam_suspected`; `label_source` chỉ `human`; không đổi `is_hidden`; khóa còn hạn của người khác chặn đổi khóa |
| `server/hide-action.ts` | `createHideAction` là đường ẩn duy nhất; bulk chỉ gọi lại nó |

## Quyết định đã chốt
- `QUYET_DINH_CHO_DUYET.md` Q3–Q6.

## Còn lại
1. Chạy `pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/comment-bulk.int.test.ts` trên máy có DB `cf_test` (làn c không có `.env`).
2. `BULK-ACTIONS-LOG`: ghi `action_logs` cho Bỏ qua/Đổi nhãn (cần hàm DEFINER → migration).
3. Phím `H` ẩn một bình luận ở chi tiết; `E`/`M` chờ làm rõ docs/03; "chọn tất cả".
4. Verifier (đã chạy, không chặn merge): khi làm `decideAutoSend`, KHÔNG lấy độ tin cậy từ `label_confidence` của dòng `label_source='human'` (đặt = 1); thêm test.
5. E2E luồng chọn nhiều (khi `E2E-CI`).

## Lệnh test liên quan
```
pnpm --filter @flow/web exec vitest run src/lib/bulk-input.test.ts src/lib/bulk-shortcuts.test.ts src/server/bulk-action.test.ts src/server/require-app-user.scan.test.ts src/i18n
```

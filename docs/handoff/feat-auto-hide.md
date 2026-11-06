# Bàn giao — nhánh `feat-auto-hide`

Cập nhật: 06/11/2026 · Mục gap matrix: AUTO-HIDE · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-auto-hide.md`

## Đã làm
- `packages/ai/src/autohide/`: `planAutoHide` (thuần), `runAutoHide` (lưu khách → ẩn), `loadAutoHideConfig` (cờ `AUTO_HIDE_ENABLED` tắt). 24 test (3 property-based). verifier-security đã chạy một lần; "Chặn merge" (shadow_until null) đã sửa, cùng 3 mục "Nên sửa" (mức `auto_hide`, `workspaceId` ở `requestHide`, bỏ `contacts` khỏi plan).

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `packages/shared/src/spam-rules.ts` | `matchSpamRule` phone/link dùng lại; `parseSpamRule` từ chối `auto_hide` (giữ nguyên) |
| `packages/ai/src/pii/mask-pipe.ts` | `maskAndCapture` lưu trước, lưu lỗi → `saved:false` |
| `packages/db/src/hides.ts` | `requestCommentHide` chỉ cho `withActor`; hệ thống chưa có đường → cần migration |

## Còn lại
1. `AUTO-HIDE-DB` (làn b, migration): CHECK `rules.action` thêm `auto_hide`; hàm DEFINER cho `withJob` yêu cầu ẩn (`requested_by` null) + `action_logs`; UI Owner.
2. `AUTO-HIDE-WIRE`: nối job `process` sau bước đánh dấu; `ContactSink` thật (`createLeadContactSink`); `HideRequester` bản DB; bước kiểm lại trạng thái ngay trước khi ẩn.
3. Tùy chọn: lưu link (zalo.me…) làm liên hệ khi có kiểu liên hệ phù hợp.

## Lệnh test liên quan
`pnpm --filter @flow/ai exec vitest run src/autohide`

# Bàn giao — nhánh `feat-ai-sent-history`

Cập nhật: 2026-11-06 · Mục gap matrix: AI-SENT-HISTORY · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-ai-sent-history.md`

## Đã làm
- Lõi thuần ở `packages/ai/src/history/` (test trước): `decideMarkWrong`, `evaluateMarkedWrongSignal`, `AutoSentHistoryStore` + bản bộ nhớ.
- Web: trang `/app/ai-sent` (Owner + Staff), `markWrongAction`, menu `aiSent`, i18n vi+en.
- Docs: gap matrix (AI-SENT-HISTORY ✅ Xong-mock, thêm AI-SENT-HISTORY-DB), MASTER, codemap (dòng riêng), Q-ASH1, KT-ASH.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `packages/db/src/schema/cf/comment-replies.ts` | Outbox gửi tay, không có dấu hiệu "AI tự gửi" → không dùng được làm nguồn lịch sử |
| `apps/web/src/server/kb-gaps.ts` + trang/action | Mẫu service + Server Action + 404 chéo workspace |

## Quyết định đã chốt trong phiên
- Q-ASH1 (xem `QUYET_DINH_CHO_DUYET.md`).

## Còn lại (theo thứ tự)
1. `AI-SENT-HISTORY-DB` (làn b, migration `drafts`/`automation_events`): store DB + test tích hợp chéo workspace, đổi `aiSentHistory()`.
2. ABUSE-JOB dùng `evaluateMarkedWrongSignal` để tạm dừng tự gửi.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/history
pnpm --filter @flow/web exec vitest run src/lib src/server src/i18n
```

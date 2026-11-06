# Bàn giao — nhánh `feat-pipe-rule-filter`

Cập nhật: 2026-11-06 · Mục gap matrix: PIPE-RULE-FILTER, PIPE-MERGE-BURST · Agent vừa làm: claude (làn c) · Commit cuối: xem `git log -1`
Kế hoạch: `docs/plans/feat-pipe-rule-filter.md`

## Đã làm
- `packages/shared/src/rule-filter.ts` (`ruleFilter`): FR-024, thận trọng (chữ/số/"?"/ký hiệu/ảnh/video → không bỏ qua), tag theo `mentions` + mẫu `@[id:0:Tên]`/`@tên`, sticker/gif.
- `packages/shared/src/merge-burst.ts` (`planMergeBurst`, `isBurstReady`, `mergeBurstText`, `burstKey`, `clampMergeWindowSeconds`): FR-148, cửa sổ 10–60 (mặc định 30), tối đa 10/lượt.
- Test TDD (đỏ trước), shared coverage giữ ngưỡng. Q-PRF1, Q-PMB1, KT-032.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `docs/09` §7.1a | Gộp = dời job `process` (`singletonKey` workspace+post+author, `startAfter` = cửa sổ); trả lời vào bình luận cuối; `merged_into_id` các bình luận trước |
| `packages/shared/vitest.config.ts` | Ngưỡng lines/statements/functions 100, branches 93; `shared` không có `fast-check` |

## Còn lại
1. Nối pipeline (job `process`, PIPE-ROUTE…): gọi `ruleFilter` trước phân loại (bỏ qua → `status` bỏ qua, không trừ lượt), loại các bình luận bị bỏ qua trước `planMergeBurst`.
2. `MERGE-BURST-DB` (cần migration, làn b): hàm DEFINER ghi `merged_into_id` (COMMENT-HIDE-MERGE-GUARD) + đọc `automation_settings.merge_window_seconds`; UI nhóm bình luận đã gộp.
3. Tag "Cần xem" cho "?" đơn lẻ nếu chủ dự án muốn khác Q-PRF1.

## Lệnh test liên quan
```
pnpm --filter @flow/shared exec vitest run src/rule-filter.test.ts src/merge-burst.test.ts
pnpm --filter @flow/shared test:coverage
```

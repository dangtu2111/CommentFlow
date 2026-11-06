# Bàn giao — nhánh `feat-suggest-ui`

Cập nhật: 06/11/2026 · Mục gap matrix: SUGGEST-UI · Agent vừa làm: claude · Kế hoạch: `docs/plans/feat-suggest-ui.md`

## Đã làm
- Hàm thuần `classifyDraftOutcome`/`editDistance`/`buildSourceChips` (`packages/shared/src/draft-feedback.ts`), `deriveSuggestionUi` (web).
- `SuggestionPanel` nhúng trong `ReplyComposer` (prop `suggestion`); `RelabelSelect` trong `CommentDetailPanel`; i18n vi+en; CSS.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `draft-result.ts` | `sources` là mảng id (chuỗi) → chip cần bảng id→tên do loader cấp |
| `actions.ts` | `relabelCommentsAction(ids, label)` trả `BulkResult` (`done` có thể 0) |
| `docs/10` bảng `drafts` | `status`, `final_text`, `edit_distance` đã spec; bảng chưa có migration |

## Quyết định đã chốt trong phiên
- Q-SUI1 (`QUYET_DINH_CHO_DUYET.md`). Không thêm `fast-check` vào `@flow/shared` (dùng mẫu cố định).

## Còn lại (theo thứ tự)
1. `SUGGEST-UI-PERSIST` (làn b, migration `drafts` + `comment_replies.draft_id`).
2. Loader nạp `CommentDetailView.suggestion` từ `drafts` (cần PIPE-DRAFT nối pipeline).
3. Job `send` gọi `classifyDraftOutcome` khi gửi xong, ghi `drafts.status/final_text/edit_distance`.

## Lệnh test liên quan
```
pnpm --filter @flow/shared test
pnpm --filter @flow/web exec vitest run src/lib/suggestion.test.ts
```

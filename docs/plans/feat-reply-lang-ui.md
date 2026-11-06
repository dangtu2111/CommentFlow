# Kế hoạch `feat-reply-lang-ui` — REPLY-LANG-SETTING

## Việc

Mã gap matrix: `REPLY-LANG-SETTING` · Spec: FR-120 (`channels.reply_language`), FR-142 (xưng hô).

**Tóm tắt:** Thêm thẻ "Ngôn ngữ trả lời" vào trang Cài đặt cho Owner: mỗi kênh chọn AI trả lời theo `auto` (theo ngôn ngữ khách) / `vi` / `en`, lưu vào cột `channels.reply_language` đã có (không migration). Xưng hô (FR-142) cần bảng `brand_voice` — chưa có migration và làn a không được thêm migration — nên chỉ làm phần thuần (tập giá trị hợp lệ + kiểm tổ hợp theo ngôn ngữ) trong `@flow/shared`; phần lưu + giao diện xưng hô ghi vào gap matrix `REPLY-ADDRESS-UI` (chờ migration `brand_voice`).

## Điểm chưa rõ

Không có (xem QRL1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. `parseReplyLanguage` chỉ nhận `auto|vi|en`, còn lại bị từ chối — test đơn vị `FR-120` (`packages/shared`).
2. `isValidAddress` (FR-142): `en` chỉ nhận khách = `you`; `vi` nhận 4 cách xưng shop × 3 cách gọi khách, `custom` đòi tên — test đơn vị `FR-142`.
3. Logic đổi ngôn ngữ trả lời: id kênh không phải uuid hoặc kênh không thuộc workspace (UPDATE 0 dòng) → `not_found`; giá trị lạ → `invalid_language`; lỗi DB → `unavailable` — test `apps/web/src/server/reply-language.test.ts`.
4. Thẻ chỉ hiện cho Owner trong Cài đặt; action dùng `requireAppUser({ role: 'owner' })` — test quét `requireAppUser` hiện có + kiểm tay.
5. Khóa i18n `vi`/`en` khớp, `pnpm lint:i18n` xanh — `messages.test.ts`.
6. Coverage `packages/shared` không giảm — `pnpm --filter @flow/shared test:coverage`.

## File sẽ đọc

Đã đọc: channels page/actions, settings page, `queries/channels.ts`, `hide-action.ts`, `language-card.tsx`, `ch-rls.int.test.ts`, `vi.json` (settings).

## File sẽ sửa / tạo

- `packages/shared/src/reply-style.ts` (+ test, export ở `index.ts`).
- `packages/db/src/queries/channels.ts` + `runtime.ts`: `listChannels` thêm `replyLanguage`; `setChannelReplyLanguage`.
- `apps/web/src/server/reply-language.ts` (+ test).
- `settings/page.tsx`, `settings/actions.ts`, `components/settings/reply-language-card.tsx`.
- `vi.json`, `en.json` (`settings.replyLanguage.*`).
- docs: gap-matrix, codemap, MASTER, QUYET_DINH_CHO_DUYET, KIEM_TRA_TAY.

## Migration

Không có. Xưng hô lưu ở `brand_voice` (cần migration, làn b / `KB-SHOP-POLICY-FAQ`).

## Test viết trước

Test `reply-style` và `reply-language` viết trước, thấy đỏ rồi mới code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/reply-style.test.ts` · `pnpm --filter @flow/web exec vitest run src/server/reply-language.test.ts`

## Cần kiểm chứng độc lập không?

Không — không chạm auth/RLS/token/cổng gửi; ghi qua đường RLS + trigger đã có (chỉ Owner), đã có test chéo vai trò ở `ch-rls.int.test.ts`.

## Rủi ro / câu hỏi cho chủ dự án

Xưng hô chưa lưu được tới khi có `brand_voice`.

## Đề xuất thay đổi

Không sửa docs/01–16.

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

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR 007; QRL1).

# Handoff `feat-kb-gaps-ui` (claude, làn d)

## Đã làm

Trang `/app/kb-gaps` (Owner-only) + menu `kbGaps` + i18n vi/en; logic thuần ở `lib/kb-gaps-form.ts`, dịch vụ ở `server/kb-gaps.ts` (db tiêm được, test bằng db giả); Server Action `kbGapAction`. Q-KG1 ghi quyết định. Không migration, không biến môi trường, không cờ.

## Đã đọc và rút ra

- `packages/db/src/retrieval-logs.ts`: `listKbGaps`, `setKbGapStatus` (trả `false` khi id không thấy được), cột `topic/status` là `string` (cần thu hẹp kiểu → `toKbGapViews`).
- `createFaqItem` (kb-content) đã export ở `@flow/db/runtime`; FAQ chưa phải `kb_sources` nên `resolved_by_source_id` để trống.
- Mẫu trang Owner: `readiness/page.tsx`; mẫu Server Action: `members/actions.ts`.

## Còn lại

`RETRIEVAL-LOG-WIRE` (ghi `kb_gaps`), `KB-CONTENT-UI` (nút Bổ sung mở đúng mục + resolved lúc xuất bản), lọc theo sản phẩm, API `/kb/gaps`, test tích hợp DB nếu muốn kiểm RLS chéo workspace cho luồng này (RLS đã được test ở `retrieval-log.int.test.ts`).

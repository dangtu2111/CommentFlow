# Kế hoạch `feat-ui-sidebar-reorg` — UI-FIDELITY: tổ chức lại thanh bên

## Việc

Mã gap matrix: `UI-FIDELITY-SIDEBAR` · Spec: docs/08 §3 · Thiết kế: `design/stitch/comments.png` (cột trái).

**Tóm tắt (UI-first, 06/11/2026):** thanh bên đang có ~16 mục phẳng, rối mắt. Đổi thành hai nhóm có tiêu đề in hoa nhỏ đúng thiết kế — "Điều hướng vận hành" (Bình luận, Bài viết) và "Hệ thống & trí tuệ" (Cơ sở kiến thức, Cài đặt tự gửi, Quy tắc spam, Nhật ký, Cài đặt) — và gom trang con vào trang cha, KHÔNG đổi URL: AI đã gửi → tab của Bình luận; Kênh, Thành viên → tab của Cài đặt; Thử AI, Độ sẵn sàng, Câu hỏi chưa trả lời, Phiên bản, Câu kiểm thử, Nhập sản phẩm → nằm trong khung Cơ sở kiến thức (đã có `KbFrame`). Mục chưa có trang thật (Tin nhắn, Khách tiềm năng, Báo cáo) không hiện. Thêm thẻ "Hạn mức AI" ở đáy (dữ liệu thật từ `loadUsageMeterView`, ẩn nếu đọc lỗi). Không đổi logic nghiệp vụ, không migration. Rủi ro: thấp (chỉ điều hướng; quyền xem trang vẫn do từng trang kiểm).

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-UISB1.

## Tiêu chí nghiệm thu

1. Owner thấy 7 mục chính theo hai nhóm; Staff chỉ thấy Bình luận, Bài viết, Nhật ký, Cài đặt — test `app-nav.test.ts`.
2. Không có mục chết: Tin nhắn/Khách tiềm năng/Báo cáo và trang con không xuất hiện ở thanh bên — test.
3. Mục cha "đang mở" cho mọi trang con (URL giữ nguyên); thanh tab hiện ở Bình luận/Cài đặt theo vai trò — test `sectionTabsFor`, `matchHrefs`.
4. Thẻ Hạn mức AI ở thanh bên (màn rộng), ẩn ở dải ngang mobile; chuỗi vi/en đủ (`lint:i18n`, `messages.test`).
5. Ảnh `/dev/ui/comments` 1440 + 390 trong `docs/plans/ui-fidelity/ui-sidebar-reorg/`.
6. Công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`design/stitch/comments.png`; `lib/app-nav.ts` (+test); `components/app/shell-nav.tsx`; `(guarded)/layout.tsx`; `lib/kb-structure.ts` (+test); `components/kb/kb-frame.tsx`; `components/settings/usage-meter-card.tsx`; `server/usage-meter.ts`; `components/dev/dev-shell.tsx`; `styles/globals.css` (khối shell-nav).

## File sẽ sửa / tạo

- `lib/app-nav.ts`, `lib/app-nav.test.ts`, `lib/kb-structure.test.ts` — mục chính + `parent` + `sectionTabsFor`.
- `components/app/{shell-nav,section-tabs,shell-quota-card}.tsx`, `(guarded)/layout.tsx`, `styles/globals.css`.
- `components/dev/dev-shell.tsx`, `app/dev/ui/{page,comments/page}.tsx` — thẻ hạn mức mẫu ([MẪU]).
- `packages/shared/src/i18n/messages/{vi,en}.json`; `e2e/support/shot-sidebar.mjs`.
- `docs/plans/ui-fidelity/ui-sidebar-reorg/*`, `docs/plans/quyet-dinh/q-uisb1.md`, gap-matrix, MASTER, `docs/codemap.d/`, handoff.

## Migration

Không có.

## Test viết trước

`app-nav.test.ts` (nhóm, vai trò, trang con, tab).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/app-nav.test.ts src/lib/kb-structure.test.ts`

## Cần kiểm chứng độc lập không?

Không: chỉ điều hướng; không chạm auth/RLS. Quyền trang giữ nguyên (`requireAppUser` từng trang).

## Rủi ro / câu hỏi cho chủ dự án

Thanh tab chưa nằm trong chính thiết kế Stitch (thiết kế chỉ có thanh bên); đã chọn tab vì chủ dự án yêu cầu. Nút "Nâng gói" chờ trang gói cước.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Tiêu chí nghiệm thu kiểm được
- [x] Không còn thẻ cần làm rõ
- [x] Không migration, không thư viện mới
- [x] Test viết trước cho hàm thuần

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định đã có trong chỉ đạo UI-first 06/11/2026 + Q-UISB1)

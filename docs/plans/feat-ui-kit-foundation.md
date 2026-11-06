# Kế hoạch `feat-ui-kit-foundation` — Nền bộ thành phần giao diện dùng chung

## Việc

Mã gap matrix: `UI-KIT` (việc mới, làn a, làm trước mọi màn UI-first) · Spec: `docs/08_UI_UX_Specification.md` §2, `design/stitch/brand-guideline.html`.

**Tóm tắt:** Giao diện hiện có nhiều khối lặp (3 kiểu tab, 3 khối `.comment-detail-head`, `.member-item`/`.session-item`/`.stepper`/`.banner` định nghĩa 2 lần…) nằm trong một `globals.css` 3101 dòng. Việc này dựng kit `components/ui` + `components/patterns` (mỗi thành phần một file CSS riêng, màu/chữ/khoảng cách chỉ từ `tokens.css`), trang xem mẫu `/dev/ui/kit`, rồi chuyển dần các trang sang kit để giảm tổng dòng CSS/TSX. Rủi ro: đổi chỗ khối CSS có thể đổi thứ tự cascade (thứ tự ưu tiên CSS) → kiểm bằng so computed style trước/sau bằng Playwright.

**Chia PR (chủ dự án cho phép 2–3 PR nối tiếp):** PR1 = tokens + kit + `/dev/ui/kit` + quy tắc kiến trúc + tách CSS nguyên thủy khỏi `globals.css` (không đổi giao diện); PR2 = chuyển trang nhóm 1 (đăng nhập, khung ứng dụng, bình luận, bài viết); PR3 = nhóm 2 (cài đặt, kiến thức, tự gửi, spam, lead, báo cáo, tin nhắn) và dọn `globals.css` thừa. Plan này áp dụng cho cả ba; mục "Còn lại" ghi trong handoff.

## Điểm chưa rõ

Không có. (Nguồn dựng = HTML Stitch + token; chủ dự án đã chốt quy trình HTML-first ngày 06/11/2026.)

## Tiêu chí nghiệm thu

PR1:
1. Token một nơi: màu/chữ/khoảng cách/bo góc/bóng khai báo ở `styles/tokens.css`; không literal bóng/bo góc lặp lại trong CSS kit — kiểm bằng: `grep` trong `components/ui/*.css` + test kiến trúc.
2. Kit có: Button, IconButton, Chip, Card, Tabs, PageHeader+Breadcrumb, SplitLayout, Stat, Avatar, Dialog, FormField (+ Banner, SectionHead đã có) — mỗi thành phần một file CSS riêng; xem được ở `/dev/ui/kit` (404 khi production) — kiểm bằng: mở route (HTTP 200) + KT-UIKIT. EmptyState/Table/AppShell/Stepper/StatusPill chưa thêm (chưa có ≥ 2 nơi dùng cùng markup) → PR2/PR3 (Q-UIKIT1).
3. Tách CSS nguyên thủy (nút, ô nhập, tab, thẻ, chip, avatar, dialog, banner, breadcrumb, page-header, split-layout) khỏi `globals.css` sang `components/ui/*.css` mà giao diện KHÔNG đổi — kiểm bằng: so computed style từng phần tử trên các route `/dev/ui/*` trước/sau (`.tmp` script Playwright, kết quả ghi vào PR).
4. Tabs (chỉ tab hiện tại có `aria-current`), FormField (liên kết nhãn–gợi ý–lỗi), Button/Chip/Avatar/Stat/SplitLayout có test đơn vị bằng `renderToStaticMarkup` (không thêm thư viện test DOM) — kiểm bằng: `pnpm --filter @flow/web exec vitest run src/components/ui`. Tabs là điều hướng bằng liên kết thật nên không có logic phím riêng.
5. Quy tắc kiến trúc có test chặn: `components/ui` và `components/patterns` không import từ `app/`; trang không import CSS của trang khác; component chỉ import CSS cùng thư mục của nó hoặc styles/ — kiểm bằng: `architecture.test.ts` + luật `depcruise`.
6. Số dòng CSS/TSX trước–sau + danh sách thành phần dùng lại/mới nêu trong PR — kiểm bằng: số liệu trong mô tả PR.
7. `pnpm precheck`, `pnpm lint`, `pnpm lint:i18n`, `pnpm typecheck`, `pnpm depcruise`, `pnpm check:plans`, `pnpm test:trace` xanh.

## File sẽ đọc

`docs/08` §2 (token), `design/stitch/brand-guideline.html` (config Tailwind + thư viện component), `apps/web/src/styles/tokens.css`, `styles/globals.css` (từng khối được tách), `components/ui/*.tsx` (đang có), `app/layout.tsx` (thứ tự import CSS), `.dependency-cruiser.cjs`.

## File sẽ sửa / tạo

Tạo: `components/ui/{button,chip,card,tabs,avatar,stat,empty-state,page-header,split-layout}.tsx` + `*.css` riêng, `components/ui/ui.css` (barrel), `components/ui/tabs-logic.ts`, test tương ứng, `app/dev/ui/kit/page.tsx`, `architecture.test.ts`. Sửa: `styles/globals.css` (bớt khối đã tách), `styles/tokens.css`, `app/layout.tsx`, `.dependency-cruiser.cjs`, `components/ui/dialog.tsx` (dùng Button/Chip), `fields.tsx` (dùng FormField). Docs: codemap.d, quyết định, gap-matrix/MASTER, handoff.

## Migration

Không có.

## Test viết trước

`form-field.test.tsx` (id nhãn/gợi ý/lỗi, aria-invalid), `kit.test.tsx` (Tabs, Button, Chip, Avatar, Stat, SplitLayout), `architecture.test.ts` (đỏ khi có import ngược).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components/ui src/architecture.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/thanh toán/cổng tự gửi; chỉ giao diện).

## Rủi ro / câu hỏi cho chủ dự án

Đổi thứ tự cascade khi tách CSS. Giảm thiểu: barrel nhập ngay sau `globals.css`, so computed style. Thiết kế Stitch có huy hiệu/số liệu minh họa: bỏ (ghi quyết định).

## Đề xuất thay đổi

Không đổi `docs/01–16`. Ghi quyết định cấu trúc kit ở `docs/plans/quyet-dinh/q-uikit1.md`.

## Complexity tracking

Không có. (Mỗi thành phần kit đã có ≥ 2 nơi dùng thật trong repo; thành phần chưa đủ 2 nơi dùng không được thêm.)

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong chỉ dẫn chủ dự án 06/11/2026; không có thẻ chưa rõ).

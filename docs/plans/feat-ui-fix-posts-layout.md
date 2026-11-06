# Kế hoạch `feat-ui-fix-posts-layout` — Khung nội dung chung trải hết bề ngang + cột phải Bài viết giãn đúng

## Việc

Mã gap matrix: UI-first (khung nội dung chung) · Spec: `docs/08_UI_UX_Specification.md` §2; `design/stitch/{posts,knowledge-base,automation,spam-rules,leads,reports,messages}.html`.

**Tóm tắt:** Chủ dự án thấy trang Bài viết thừa khoảng trống hai bên và cột phải không giãn. Nguyên nhân gốc: lớp dùng chung `.app-page-wide` (vẫn đặt `max-width: 880px`, canh giữa) nên MỌI trang nghiệp vụ bị bó hẹp; riêng `/dev/ui/kb-posts` còn đặt cột phải cố định 380px trong khi Stitch chia lưới 12 cột (7/5). Sửa một chỗ trong khung chung + lưới Bài viết, không đổi nghiệp vụ, không migration.

## Điểm chưa rõ

Không có (làn a đã merge sửa khung Cài đặt #192 nhưng không đụng `.app-page-wide`; tự chọn phương án khuyến nghị, ghi `q-uipl1`).

## Tiêu chí nghiệm thu

1. Vùng nội dung Bài viết/KB/Tự động hóa/Spam/Khách tiềm năng/Báo cáo/Tin nhắn trải hết phần còn lại sau thanh bên, lề 16px, ở 1440/1920/2560 (sai lệch ≤ 2px so HTML Stitch; Khách tiềm năng/Báo cáo chặn 1720px) — kiểm bằng: `node e2e/support/measure-content-frame.mjs`.
2. Cột trái/phải Bài viết: 665/471 (1440) và 945/671 (1920) như Stitch ≤ 2px — kiểm bằng: `node e2e/support/measure-posts-cards.mjs`.
3. Lưới `.two-col` dùng `minmax(0, …)` (không tràn) — đọc CSS.
4. `pnpm precheck`, `pnpm lint`, `pnpm typecheck`, test web xanh.

## File sẽ đọc

`styles/globals.css` (`.app-page*`), `styles/frames.css`, `components/posts/posts.css`, 4 page leads/reports (thật + dev), `app/dev/ui/kb-posts/page.tsx`.

## File sẽ sửa / tạo

`globals.css` (`.app-page-wide` hết max-width, thêm `.app-page-cap`), `frames.css` (`minmax(0, …)`), `posts.css` (lưới 12 cột 7/5), 4 page leads/reports (thêm `app-page-cap`), `e2e/support/measure-content-frame.mjs`, `measure-posts-cards.mjs`, `docs/plans/ui-fidelity/ui-fix-posts-layout/`, codemap/quyết định/KT/handoff.

## Migration

Không có.

## Test viết trước

Giao diện thuần (CSS); kiểm bằng script đo Playwright ở trên (không có logic quy tắc).

## Lệnh test phạm vi hẹp

`node e2e/support/measure-content-frame.mjs`; `node e2e/support/measure-posts-cards.mjs`; `pnpm --filter @flow/web typecheck`.

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Trang hẹp cố ý (Tin nhắn dùng `app-page-full` riêng; Kênh/Thành viên dùng `app-page-settings`) không đổi. KB/Spam: Stitch lề 24px ở thanh lệnh/tiêu đề, bản dựng 16px (lệch 8px mỗi bên, ghi nhận).

## Đề xuất thay đổi

Không có.

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

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/HTML Stitch).

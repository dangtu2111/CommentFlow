# Kế hoạch `feat-ui-kit-migrate` — Chuyển trang sang kit dùng chung (PR2/3 của UI-KIT)

## Việc

Mã gap matrix: `UI-KIT` · tiếp `docs/plans/feat-ui-kit-foundation.md` (PR1 #172 đã merge; kế hoạch đó áp dụng cho cả ba PR).

**Tóm tắt:** Gộp các khối CSS/TSX trùng lặp còn sót vào kit `components/ui` và xóa bản cũ: ảnh đại diện (`.inbox-avatar`/`.msg-avatar` + huy hiệu nền tảng → `Avatar badge`), tab viên thuốc (`.posts-tab*` → `Tabs variant="pill"`), thanh các bước (hai bản `.stepper*` trùng tên → `Stepper`), cộng selector chết. Rủi ro: lệch nhẹ kích thước/màu avatar giữa các màn (đã chốt một chuẩn, Q-UIKIT2).

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `Avatar` có `badge`; 4 nơi dùng chuyển sang kit, CSS `.inbox-avatar*`/`.msg-avatar*`/`.msg-platform*` đã xóa — kiểm bằng: test `kit.test.tsx` + grep không còn class cũ.
2. `Tabs` có biến thể `pill`; `PostsTabs` dùng kit, `.posts-tab*` đã xóa — kiểm bằng: test `kit.test.tsx`.
3. `Stepper` dùng chung cho onboarding và 2FA; hai bản CSS `.stepper*` trong `globals.css`/`frames.css` đã xóa — kiểm bằng: test `kit.test.tsx`, typecheck.
4. Tổng dòng CSS giảm; số liệu trước–sau nêu trong PR — kiểm bằng: `git diff --stat`.
5. `pnpm precheck`, lint, lint:i18n, typecheck, depcruise, test web xanh.

## File sẽ đọc

`components/ui/{avatar,tabs}.{tsx,css}`, `inbox-list.tsx`, `comment-detail.tsx`, `message-center.tsx`, `posts-tabs.tsx`, `onboarding-stepper.tsx`, `two-factor-card.tsx`, các khối CSS tương ứng.

## File sẽ sửa / tạo

Tạo `ui/stepper.{tsx,css}`; sửa `ui/{avatar,tabs}`, `ui/ui.css`, `kit.test.tsx`, `/dev/ui/kit`, các trang dùng ở trên, `globals.css`, `frames.css`, `kb-posts.css`, `messages.css`. Docs: codemap.d, quyết định Q-UIKIT2, gap-matrix, handoff.

## Migration

Không có.

## Test viết trước

Mở rộng `kit.test.tsx` (pill, badge, Stepper).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components/ui`

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện).

## Rủi ro / câu hỏi cho chủ dự án

Avatar cỡ lớn thống nhất 64px (trước 56/72px), màu nền thống nhất theo token; huy hiệu nền tảng một kiểu (bỏ màu riêng IG/TikTok của tin nhắn).

## Đề xuất thay đổi

Không đổi `docs/01–16`.

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

**Đã duyệt** (tự duyệt: quyết định theo chỉ dẫn chủ dự án 06/11/2026; không có thẻ chưa rõ).

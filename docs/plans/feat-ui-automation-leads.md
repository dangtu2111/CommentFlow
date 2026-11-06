# Kế hoạch `feat-ui-automation-leads` — UI-FIDELITY nhóm 6 (Tự động hóa, Quy tắc spam, Khách tiềm năng)

Mã gap matrix: `UI-FIDELITY-AUTO-LEADS` (mới) · Mã ảnh `ui-auto-leads` · Spec: `docs/08` §2, §7; thiết kế `design/stitch/automation.png`, `spam-rules.png`, `leads.png`.

**Tóm tắt:** Làm giao diện ba màn khớp thiết kế Stitch, không đổi logic, không migration. Tự động hóa và Quy tắc spam là trang thật: đổi bố cục/kiểu (thẻ có số mục, ô chế độ dạng viên màu Tự động/Chạy thử/Tắt, hai cột Ngưỡng an toàn, khối nguyên tắc "AI không tự ẩn bình luận"). Khách tiềm năng chưa có trang thật (cần bảng leads, làn b) nên chỉ dựng trang mẫu dev `/dev/ui/leads` (Kanban + thẻ chi tiết) gắn "[MẪU]"; danh sách quy tắc spam + bảng bình luận bị ẩn cũng chỉ ở trang mẫu dev. Rủi ro thấp (chỉ giao diện).

## Điểm chưa rõ

Không có (xem QAL1).

## Tiêu chí nghiệm thu

1. `modeTone` (`lib/automation-ui.ts`) ánh xạ đúng `off/shadow/auto` → tông viên — kiểm bằng `automation-ui.test.ts`.
2. Trang `/app/automation` và `/app/spam-rules` giữ nguyên Server Action/tên trường form (`mode:<kênh>:<đối tượng>:<nhãn>`, …) — test `automation-form` hiện có vẫn xanh.
3. Không có số liệu/huy hiệu bịa trên trang thật (không "142 câu", "98.6%", "Dừng khẩn cấp" giả); khối chỉ có ở thiết kế nằm ở trang mẫu dev với "[MẪU]" — đọc code + ảnh.
4. `/dev/ui/leads`, `/dev/ui/spam-rules` trả 404 khi production; mọi khối mẫu có "[MẪU]".
5. i18n vi/en đủ khóa (`pnpm lint:i18n`), lint/typecheck/depcruise/check:plans xanh.
6. Ảnh sau ở `docs/plans/ui-fidelity/ui-auto-leads/` (nếu chụp được) + danh sách khớp/chưa khớp ở PR.

## File sẽ đọc / sửa

Đọc: automation page/form, spam-rules page/builder, dev/ui kb-posts page, kb-posts.css, tokens.css, vi/en.json.
Sửa/tạo: `lib/automation-ui.ts`(+test), `components/automation/automation-form.tsx`, `automation/page.tsx`, `spam-rules/page.tsx`, `components/spam-rules/spam-rule-builder.tsx`, `styles/auto-leads.css` + `app/layout.tsx` (import), `app/dev/ui/{leads,spam-rules}/page.tsx`, i18n vi/en, `docs/codemap.d/mien-ui-auto-leads.md`, `docs/plans/quyet-dinh/qal1.md`, gap-matrix, MASTER, handoff.

## Migration

Không có. (Trang Khách tiềm năng thật cần bảng leads → ghi gap `LEADS-KANBAN` thuộc làn b.)

## Test viết trước

`automation-ui.test.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/automation-ui.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/cổng tự gửi; chỉ markup/CSS, giữ nguyên action và kiểm vai trò).

## Rủi ro / câu hỏi cho chủ dự án

Các khối thiết kế cần dữ liệu thật chưa có (đếm đã gửi hôm nay, Dừng khẩn cấp, kiểu trả lời công khai/nhắn riêng, danh sách quy tắc + bình luận bị ẩn, leads) → ghi vào gap matrix, không bịa.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có ở QAL1).

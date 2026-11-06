# Kế hoạch `feat/ui-complete-automation-spam` — Công cụ đối chiếu nội dung + dựng đủ thành phần Tự động hóa / Quy tắc spam

Mã gap matrix: `UI-COMPLETE-AUTO-SPAM` (việc UI-first, không có mã spec riêng) · Spec: `design/stitch/automation.html`, `design/stitch/spam-rules.html`, `docs/08_UI_UX_Specification.md` §2.

**Tóm tắt:** Chủ dự án thấy `/app/automation` và `/app/spam-rules` quá khác thiết kế và thiếu thành phần. Việc này (1) viết công cụ so chữ giữa file HTML Stitch và trang thật bằng Playwright, (2) dựng đủ mọi thành phần của hai màn bằng kit dùng chung (thêm Switch, Progress, MetricCard; mở rộng Tabs, Chip, PageHeader), (3) chạy công cụ cho mọi trang đã merge và ghi bản kiểm kê thiếu. Không đổi logic nghiệp vụ, không migration; chỗ chưa có chức năng thì hiện đúng thiết kế nhưng vô hiệu kèm "Sắp có".

**Trạng thái duyệt:** Đã duyệt (chủ dự án giao việc trực tiếp; mọi quyết định có trong QUY TẮC ĐỦ THÀNH PHẦN / HTML-FIRST)

## Điểm chưa rõ

Không có. (Tự chọn khuyến nghị an toàn: số liệu/quy tắc/nhật ký chưa có dữ liệu thật chỉ hiện ở dev dưới dạng `[MẪU]`; production hiện "—"/trạng thái trống + "Sắp có". Ghi ở `docs/plans/quyet-dinh/quic1.md`.)

## Tiêu chí nghiệm thu

1. `e2e/support/ui-completeness.mjs <slug> <route>` in đúng mục có trong HTML nhưng thiếu ở trang, phần so khớp có test đơn vị — kiểm bằng: `pnpm --filter ./scripts exec vitest run lib/ui-completeness.test.mjs`.
2. `/dev/ui/automation` và `/dev/ui/spam-rules` đạt ≥ 95% khớp chữ với HTML (trong vùng `<main>`) — kiểm bằng: chạy công cụ, nộp báo cáo ở `docs/plans/ui-fidelity/automation-spam/`.
3. Sai lệch kích thước/khoảng cách/font/màu của phần tử chính ≤ 2px so với HTML — kiểm bằng: script đo bbox, kết quả `so-bbox.json` cùng thư mục.
4. Mọi thành phần chưa có chức năng vô hiệu (`aria-disabled`) kèm "Sắp có"; không có số liệu thật bịa — kiểm bằng: test thành phần + rà tay.
5. Lưu cài đặt tự gửi vẫn hoạt động (đã thêm chữ ký bật/tắt, thanh trượt ngưỡng) — kiểm bằng: `automation-form.test.ts` (test mới trước).
6. Kit không nhân bản: thành phần mới ở `components/ui/`, số dòng CSS/TSX của hai trang không tăng trùng lặp — kiểm bằng: bảng trước/sau trong báo cáo.
7. Bản kiểm kê thiếu cho mọi trang đã merge ở `docs/plans/ui-thieu-thanh-phan.md` — kiểm bằng: mở file.
8. `pnpm precheck`, `pnpm lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `test:trace` xanh.

## File sẽ đọc

`design/stitch/automation.html`, `design/stitch/spam-rules.html`, `components/automation/automation-form.tsx`, `components/spam-rules/spam-rule-builder.tsx`, `styles/automation.css`, `styles/spam-rules.css`, `lib/automation-form.ts`, `components/ui/{page-header,chip,tabs,stat}.*`, `vi.json`/`en.json` (nhóm `automation`, `spamRules`).

## File sẽ sửa / tạo

- Công cụ: `scripts/lib/ui-completeness.{mjs,test.mjs}` (phần thuần + test), `e2e/support/ui-completeness.mjs` (Playwright).
- Kit: `components/ui/{switch,progress,metric-card}.{tsx,css}`; mở rộng `tabs`, `chip`, `page-header`.
- Trang: `components/automation/*`, `components/spam-rules/*`, `styles/{automation,spam-rules}.css`, `lib/automation-form.ts` (chữ ký bật/tắt), `lib/sample-data.ts`, `app/dev/ui/{automation,spam-rules}/page.tsx`, hai `page.tsx` thật, `vi.json`/`en.json`.
- Tài liệu: báo cáo `docs/plans/ui-fidelity/automation-spam/`, `docs/plans/ui-thieu-thanh-phan.md`, codemap/quyết định (file riêng), handoff, MASTER/gap-matrix (dòng của việc).

## Migration

Không có.

## Test viết trước

`scripts/lib/ui-completeness.test.mjs` (chuẩn hóa/so khớp), `apps/web/src/lib/automation-form.test.ts` (chữ ký tắt → rỗng), `apps/web/src/lib/sample-data.test.ts`, test kit (Switch/Progress/MetricCard/Tabs disabled).

## Lệnh test phạm vi hẹp

`pnpm --filter ./scripts exec vitest run`, `pnpm --filter @flow/web exec vitest run <file>`, `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise`.

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/gửi; chỉ giao diện và phân tích form).

## Rủi ro / câu hỏi cho chủ dự án

Thiết kế có "Tự động ẩn", "Dừng khẩn cấp", "Khôi phục mặc định", kiểu trả lời… chưa có chức năng: hiện vô hiệu "Sắp có". Chữ trong HTML nói sai sự thật (ví dụ "lưu ngay lập tức") được thay bằng câu đúng và ghi vào báo cáo là chủ ý.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có. (Thành phần mới đều dùng ≥ 2 nơi: Switch, Progress, MetricCard.)

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

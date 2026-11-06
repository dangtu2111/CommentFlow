# Handoff `feat-ui-gate-comments` (claude)

**Đã làm:** màn Bình luận đủ thành phần theo `comments.html`: cổng đủ thành phần 38/105 (36,2%) → 105/105 (100%). Báo cáo: `docs/plans/ui-fidelity/gate-comments/{truoc,sau}.md`; đo bbox: `so-bbox.json` + ảnh `sau-1440.png`, `sau-390.png`, `stitch-1440.png`.

**Đọc + rút ra:** bộ so chữ coi mỗi text node là một mục và chỉ khớp khi nằm TRỌN trong một text node của trang → nhãn có dấu `:` phải render một chuỗi (`` {`${label}:`} ``), hậu tố nhãn phải nối chuỗi chứ không tách node React. Số bị bỏ khi so nên dữ liệu mẫu dùng đúng chuỗi Stitch.

**Quy ước:** dữ liệu `[MẪU]` chỉ truyền ở `app/dev/ui/comments/page.tsx` qua `sample`/`aiHealth`/`extras`; trang thật không truyền → "—"/"Sắp có". Nút chưa có chức năng: `aria-disabled="true"` + `title` "Sắp có".

**Chênh lệch còn lại (≤ 2px chưa đạt ở 2 chỗ):** thẻ bình luận đầu rộng 354 thay vì 384 (ô chọn hàng loạt chiếm 30px — tính năng thật, giữ) và cao 127 thay vì 122; nút gửi rộng hơn Stitch (chữ dài hơn bản đo offline). Thanh hành động xuống 2 hàng ở cột chi tiết 576px (Stitch tràn một hàng). Không dựng ảnh đại diện/ảnh sản phẩm (không có ảnh thật).

**Việc còn lại:** nối dữ liệu thật cho các khối mẫu (`UI-FIDELITY-COMMENTS-DATA`), lọc theo nhãn AI (`INBOX-FILTER-LABEL`), Bỏ qua/Nhắn riêng cho MỘT bình luận.

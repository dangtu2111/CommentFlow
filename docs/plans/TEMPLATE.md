# Kế hoạch `<nhánh>` — <tên việc>

> Mẫu của `docs/workflows/feature.md` (bước 3–4). Chép file này thành `docs/plans/<nhánh với / → ->.md`, điền, xóa các dòng `>` hướng dẫn.
> Cổng máy kiểm (`pnpm check:plans`): khi **Trạng thái duyệt** là "Đã duyệt" thì không được còn thẻ chưa-rõ, còn ô chưa tick trong Checklist plan, hay Tiêu chí nghiệm thu rỗng.

## Việc

Mã gap matrix: `<mã>` · Spec: `<mục spec>`.

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** làm gì, vì sao, rủi ro gì. Thuật ngữ kỹ thuật lần đầu có giải thích ngắn trong ngoặc.

## Điểm chưa rõ

> Mọi chỗ mơ hồ ghi thành MỘT thẻ cụ thể, không tự đoán. Ví dụ (đang trong code nên không bị tính là thẻ thật):
> `[CẦN LÀM RÕ: đăng nhập chỉ email + mật khẩu, hay thêm OAuth?]`
> Kèm khuyến nghị của agent. Chủ dự án trả lời → thay thẻ bằng quyết định ("Quyết định: …") rồi mới được duyệt. Không còn điểm chưa rõ → ghi "Không có".

## Tiêu chí nghiệm thu

> Mỗi tiêu chí **kiểm được** (test, lệnh, hoặc bước thủ công có kết quả quan sát được) và đo được. `/finish` đối chiếu từng tiêu chí với bằng chứng.

1. <hành vi quan sát được> — kiểm bằng: <test/lệnh/bước>

## File sẽ đọc (≤ ~8, kèm lý do)

## File sẽ sửa / tạo

## Migration

> Không có / số + nội dung + đường lùi.

## Test viết trước

> Cho logic quy tắc (AGENTS.md "Cách làm việc").

## Lệnh test phạm vi hẹp

## Cần kiểm chứng độc lập không?

> Chỉ khi diff thuộc diện nhạy cảm (AGENTS.md § Phối hợp nhiều agent); không thì "Không".

## Rủi ro / câu hỏi cho chủ dự án

## Đề xuất thay đổi

> Đề xuất sửa `docs/01–16`, ADR, hoặc kế hoạch này (bằng lời; không tự sửa spec).

## Complexity tracking

> Plan có vi phạm nguyên tắc nào của `AGENTS.md` không (thêm thư viện, thêm tầng trừu tượng khi chưa có ≥ 2 nơi dùng, tái cấu trúc rộng, đi ngoài `withWorkspace`…)? Mỗi vi phạm ghi: nguyên tắc nào · vì sao cần · phương án đơn giản hơn đã loại và lý do. Không vi phạm → "Không có".

## Checklist plan

> Agent tự tick trước khi trình duyệt (rà "như unit test cho plan"); công cụ kiểm không còn ô trống khi plan đã duyệt.

- [ ] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [ ] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [ ] Logic quy tắc đã có test viết trước
- [ ] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [ ] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [ ] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [ ] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Chờ duyệt.** Chưa sửa code.

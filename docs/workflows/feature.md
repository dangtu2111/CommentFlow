# Quy trình bắt đầu một việc

> Tên file theo nhánh: thay `/` bằng `-` (nhánh `feat/fr-034` → `docs/plans/feat-fr-034.md`, `docs/handoff/feat-fr-034.md`).

Việc: `<mã gap matrix>` (người dùng cung cấp)

1. Nếu có `docs/handoff/<nhánh hiện tại>.md` → đọc trước, dùng lại "Đã đọc và rút ra", không đọc lại các file đó trừ khi đã đổi.
2. Đọc dòng `<mã>` trong `docs/gap-matrix.md`, mục spec tương ứng theo `docs/specs/README.md`, và phần liên quan của `docs/codemap.md`. Không đọc thêm spec khác.
3. Lập kế hoạch ngắn gồm đúng các mục:
   - **File sẽ đọc** (tối đa ~8; mỗi file kèm lý do)
   - **File sẽ sửa / tạo**
   - **Migration** (nếu có)
   - **Test viết trước** (cho logic quy tắc)
   - **Lệnh test phạm vi hẹp**
   - **Cần kiểm chứng độc lập không?** — chỉ khi diff thuộc diện nhạy cảm (AGENTS.md § Phối hợp nhiều agent); không thì "Không"
   - **Rủi ro / câu hỏi cho chủ dự án**
4. Ghi kế hoạch vào `docs/plans/<nhánh>.md` (mục: Việc, File sẽ đọc, File sẽ sửa, Migration, Test, Kiểm chứng, Rủi ro, Đề xuất thay đổi, Trạng thái duyệt).
5. Dừng và chờ duyệt. Chưa sửa code.

Nếu `docs/plans/<nhánh>.md` đã có và đã duyệt → **không lập lại**; đọc nó + handoff rồi làm tiếp từ "Còn lại".

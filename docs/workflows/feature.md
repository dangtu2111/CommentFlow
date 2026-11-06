# Quy trình bắt đầu một việc

> Tên file theo nhánh: thay `/` bằng `-` (nhánh `feat/fr-034` → `docs/plans/feat-fr-034.md`, `docs/handoff/feat-fr-034.md`).
> Quy trình này mượn ba ý của Spec-Driven Development (github/spec-kit) mà không cài công cụ của họ: **không code khi còn điểm chưa rõ**, **tiêu chí nghiệm thu kiểm được**, **ghi lý do khi vi phạm nguyên tắc**. Cổng kiểm do công cụ làm (`pnpm check:plans`), không dùng AI.

> Nhánh `mech/*`, `ops/*` và `fix/*` nhỏ (từ `/fix-issues`) **không cần plan**; `feat/*` và `chore/*` bắt buộc (cổng `pnpm check:plans` kiểm lịch sử nhánh).

Việc: `<mã gap matrix>` (người dùng cung cấp)

1. Nếu có `docs/handoff/<nhánh hiện tại>.md` → đọc trước, dùng lại "Đã đọc và rút ra", không đọc lại các file đó trừ khi đã đổi.
2. Đọc dòng `<mã>` trong `docs/gap-matrix.md`, mục spec tương ứng theo `docs/specs/README.md`, và phần liên quan của `docs/codemap.md` (file sinh ra từ `docs/codemap.d/`; khi cần sửa thì thêm file riêng ở đó + `pnpm codemap:build`). Không đọc thêm spec khác.
3. Lập kế hoạch theo mẫu `docs/plans/TEMPLATE.md`, gồm đúng các mục:
   - **Việc** + tóm tắt 2–3 câu dễ hiểu
   - **Điểm chưa rõ** — mỗi chỗ mơ hồ là một thẻ `[CẦN LÀM RÕ: câu hỏi cụ thể]` kèm khuyến nghị; **không tự đoán**. Không có → "Không có"
   - **Tiêu chí nghiệm thu** — mỗi tiêu chí kiểm được (test, lệnh, hoặc bước thủ công có kết quả quan sát được) kèm cách kiểm
   - **File sẽ đọc** (tối đa ~8; mỗi file kèm lý do) · **File sẽ sửa / tạo**
   - **Migration** (nếu có) · **Test viết trước** (cho logic quy tắc) · **Lệnh test phạm vi hẹp**
   - **Cần kiểm chứng độc lập không?** — chỉ khi diff thuộc diện nhạy cảm (AGENTS.md § Phối hợp nhiều agent); không thì "Không"
   - **Rủi ro / câu hỏi cho chủ dự án** · **Đề xuất thay đổi** (docs/ADR; bằng lời)
   - **Complexity tracking** — mọi chỗ plan đi ngược nguyên tắc của `AGENTS.md` (thêm thư viện, tầng trừu tượng khi chưa có ≥ 2 nơi dùng, tái cấu trúc rộng…): nguyên tắc nào · vì sao cần · phương án đơn giản hơn đã loại. Không có → "Không có"
   - **Checklist plan** — agent tự tick các ô trước khi trình duyệt
   - **Trạng thái duyệt** — "Chờ duyệt"
   > Việc nhỏ (sửa lỗi một file, đổi chuỗi): được dùng bản rút gọn giữ **Việc, Tiêu chí nghiệm thu, Test, Trạng thái duyệt**; cổng chỉ kiểm các mục có mặt.
4. Ghi kế hoạch vào `docs/plans/<nhánh>.md`.
5. **Dừng và chờ duyệt. Chưa sửa code.** Còn thẻ `[CẦN LÀM RÕ]` chưa được trả lời thì không được bắt đầu code, kể cả khi phần còn lại đã rõ.
6. Chủ dự án trả lời: thay từng thẻ bằng quyết định ("Quyết định: …"), ghi điều chỉnh vào plan, đổi **Trạng thái duyệt** thành "Đã duyệt", chạy `pnpm check:plans` (phải đạt: không còn thẻ, không còn ô trống trong Checklist plan, Tiêu chí nghiệm thu không rỗng) rồi mới code.

**Việc giao diện (UI-FIRST, Q-UIF1):** làm phần giao diện khớp thiết kế Stitch trước khi gắn chức năng. Lấy thiết kế từ `design/stitch/<slug>.png` (+ `.html`), `DESIGN.md`, `docs/08` §2; thiếu màn → ghi `docs/plans/ui-thieu-thiet-ke.md`, không tự bịa (Stitch chỉ qua `docs/workflows/stitch-sync.md`). Dữ liệu mẫu dev: `pnpm dev:seed-demo` (nhãn `[MẪU]`, chỉ `cf_dev`, `APP_ENV=dev`). Mỗi màn: chụp 1440px (+390px) → so thiết kế → liệt kê điểm lệch → sửa bằng component/token → nộp ảnh trước/sau ở `docs/plans/ui-fidelity/<mã>/`; mô tả PR nêu điểm đã khớp/chưa khớp. Không đổi logic nghiệp vụ, không migration.

Nếu `docs/plans/<nhánh>.md` đã có và đã duyệt → **không lập lại**; đọc nó + handoff rồi làm tiếp từ "Còn lại".

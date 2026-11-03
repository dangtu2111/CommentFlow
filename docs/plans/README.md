# Kế hoạch theo nhánh

Mỗi nhánh một file `<nhánh>.md`, tạo ở bước 3–4 của `docs/workflows/feature.md` từ mẫu `TEMPLATE.md`. Agent nào nhận việc cũng dùng kế hoạch này, không lập lại. Xóa khi nhánh merge.

Cổng kiểm bằng công cụ: `pnpm check:plans` (chạy trong CI và ở bước 1 của `/finish`). Plan **đã duyệt** không được còn thẻ `[CẦN LÀM RÕ: …]`, còn ô chưa tick trong "Checklist plan", hay "Tiêu chí nghiệm thu" rỗng. Plan chờ duyệt/bản nháp chưa bị kiểm.

**Nhánh nào cần plan:** `feat/*` và `chore/*` phải có plan của mình — cổng kiểm lịch sử nhánh có từng thêm `docs/plans/<nhánh với / → ->.md` (plan bị xóa lúc kết thúc việc vẫn được tính). `mech/*`, `ops/*` và `fix/*` (sửa lỗi nhỏ từ `/fix-issues`) được **miễn**; nếu vẫn có file plan thì file đó bị kiểm như mọi plan. Tiền tố khác (`main`…) cũng được miễn.

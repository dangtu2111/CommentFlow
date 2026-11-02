---
description: (Máy phụ, model haiku) Làm một việc cơ học kiểm được bằng công cụ
---

Việc: $ARGUMENTS

1. Chỉ nhận việc **cơ học, có đầu vào rõ, kiểm được bằng lint/typecheck/test** (tách chuỗi giao diện ra `vi.json`/`en.json`, dịch chuỗi, đổi tên theo danh sách, thêm trường theo mẫu đã duyệt, cập nhật `docs/codemap.md`/`docs/gap-matrix.md`). Việc chạm logic nghiệp vụ, RLS, auth, thanh toán, cổng tự gửi, prompt AI → **từ chối**, tạo issue nhãn `mech` giao về máy chính.
2. `git pull` → `git checkout -b mech/<việc-ngắn>`. Chỉ đọc file được nêu trong việc hoặc issue.
3. Làm → chạy lint, typecheck, test phạm vi hẹp. Sai 2 lần → dừng, ghi issue nhãn `mech` mô tả lỗi, không thử lần ba.
4. Xanh → commit, push, báo ≤ 4 dòng (file đã đổi, lệnh kiểm đã chạy).

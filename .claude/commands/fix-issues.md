---
description: (Máy code) Lấy lỗi staging từ GitHub Issues và sửa trên nhánh tương ứng
---

1. `gh issue list --label staging-bug --state open` → chọn issue của nhánh $ARGUMENTS (không có đối số → hỏi chủ dự án chọn).
2. Đọc issue + `docs/staging/<nhánh>.md`; không đọc lại source ngoài các file issue chỉ tới.
3. Viết test tái hiện lỗi trước, sửa, chạy test phạm vi hẹp, rồi `/finish`. Commit message có `fixes #<số>`. Không tự push.

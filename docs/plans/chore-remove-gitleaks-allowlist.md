# Kế hoạch: bỏ allowlist gitleaks cho email-invite.html

Trạng thái: Đã duyệt

Allowlist (commit 4af375f) được thêm để tránh báo nhầm token mời giả trong HTML mẫu Stitch khi nhánh chứa nó còn tồn tại. Nhánh `chore/stitch-fetch-html` đã bị xóa và `design/stitch/email-invite.html` đã được làm sạch (giá trị `DUMMY_TOKEN_DESIGN_ONLY`), nên allowlist không còn cần. Gỡ để cấu hình quét bí mật trở lại chặt như cũ.

## Tiêu chí nghiệm thu
- `.gitleaks.toml` không còn mục allowlist `email-invite`.
- Job gitleaks xanh.

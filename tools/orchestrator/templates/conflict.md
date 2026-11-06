PR #{{pr}} (nhánh `{{branch}}`, repo `{{repo}}`) đang **xung đột** với `origin/{{base}}`. Đây là lần sửa {{attempt}}/{{maxFixes}} — hết lượt thì bộ điều phối báo KẸT.

Các nguyên nhân bạn đã ghi ở lần sửa trước:
{{previousCauses}}

## Làm

1. `git fetch origin`, rồi `git merge origin/{{base}}` trong nhánh `{{branch}}` (**không rebase, không force-push**).
2. Giải quyết từng file xung đột bằng cách **giữ cả hai phía** khi là danh sách/dòng độc lập (bản đồ code, gap matrix, danh sách quyết định, lockfile: giữ dòng của cả hai nhánh; lockfile thì để công cụ sinh lại: `pnpm install` rồi kiểm diff). Không viết lại cả file, không xóa dòng của nhánh kia.
3. Xung đột migration: **số migration của nhánh bạn phải nhảy sang số kế tiếp sau `origin/{{base}}`** (đổi tên file, mục trong `_journal.json`, tham chiếu trong test), rồi chạy kiểm số migration. Không sửa migration đã nằm trên `{{base}}`.
4. Chạy lại kiểm tra đúng phạm vi:
{{verifyCommands}}
5. Commit merge (message ghi "merge origin/{{base}}; giữ cả hai phía"), `git add` đúng từng file, `git push origin {{branch}}` (push thường).

## Bắt buộc

Cuối câu trả lời in đúng một dòng: `NGUYÊN NHÂN GỐC: <một câu: vì sao xung đột xảy ra>` — bộ điều phối so dòng này với lần trước để phát hiện sửa lặp.

Cấm: `--force`, `rebase`, `reset --hard`, `git add -A`/`.`, đọc `.env*`.

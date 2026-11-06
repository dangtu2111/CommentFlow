CI của PR #{{pr}} (nhánh `{{branch}}`, repo `{{repo}}`) **đỏ**. Đây là lần sửa {{attempt}}/{{maxFixes}} — hết lượt thì bộ điều phối báo KẸT.

Check lỗi:
{{failedChecks}}

Các nguyên nhân bạn đã ghi ở lần sửa trước (nếu cùng nguyên nhân → đổi cách tiếp cận, đừng lặp lại):
{{previousCauses}}

## Làm

1. `gh run list --branch {{branch}} --limit 3` rồi `gh run view <id> --log-failed` — đọc **log thật**, không đoán.
2. Tìm nguyên nhân gốc trước khi sửa; tái hiện cục bộ bằng đúng lệnh của CI:
{{verifyCommands}}
3. Sửa nhỏ nhất đủ để xanh + thêm test hồi quy. Không tắt test, không nới ngưỡng để qua.
4. Commit, `git add` đúng từng file, `git push origin {{branch}}` (push thường, **không force**).
5. Cần cập nhật theo `origin/{{base}}` → `git merge origin/{{base}}` (không rebase).

## Bắt buộc

Cuối câu trả lời in đúng một dòng: `NGUYÊN NHÂN GỐC: <một câu>` — bộ điều phối so dòng này với lần trước để phát hiện sửa lặp. Nếu nguyên nhân do hạ tầng (billing/quota/runner hỏng) không sửa được bằng code, vẫn ghi dòng đó và dừng, không đoán mò.

Cấm: `--force`, `rebase`, `reset --hard`, `git add -A`/`.`, đọc `.env*`.

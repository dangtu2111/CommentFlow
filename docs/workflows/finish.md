# Quy trình kết thúc một việc

1. Chạy lint, typecheck và test **phạm vi đã đổi**; chỉ in lỗi. Đỏ → sửa, không gọi agent nào.
2. Xanh → xem `git diff --stat`. Diff thuộc diện nhạy cảm → cần **một** lần kiểm chứng theo `docs/workflows/verify.md` (Claude Code: agent `verifier-security`/`verifier-db`; hoặc agent khác với agent đã viết code). Không thuộc diện → bỏ qua.
3. Sửa các mục "Chặn merge" của verifier; chạy lại test phạm vi hẹp. Không gọi verifier lần hai trừ khi sửa chạm lại đúng phần nhạy cảm.
4. Cập nhật trong cùng commit:
   - `docs/gap-matrix.md`: dòng của việc → ✅ Xong + nhánh.
   - `docs/codemap.md`: chỉ dòng có file mới/đổi vai trò.
5. Việc chưa xong, hoặc sắp đổi agent → commit phần đã xong, ghi `docs/handoff/<nhánh>.md` theo `docs/handoff/TEMPLATE.md` (ghi rõ agent vừa làm). Xong hẳn → xóa handoff và plan của nhánh.
6. Đề xuất commit message; không tự push.

# Quy trình kết thúc một việc

1. Chạy lint, typecheck và test **phạm vi đã đổi**, cùng `pnpm check:plans`; chỉ in lỗi. Đỏ → sửa, không gọi agent nào.
2. **Đối chiếu tiêu chí nghiệm thu** (mục trong `docs/plans/<nhánh>.md`): với từng tiêu chí ghi bằng chứng (tên test hoặc lệnh đã chạy và kết quả). Tiêu chí chưa đạt → sửa tiếp, hoặc nêu rõ trong `docs/handoff/<nhánh>.md` mục "Còn lại" và trong báo cáo; không báo "xong" khi còn tiêu chí chưa có bằng chứng. Plan có mục "Complexity tracking" → xác nhận mọi vi phạm trong diff đều đã được ghi ở đó.
3. Xanh → xem `git diff --stat`. Diff thuộc diện nhạy cảm → cần **một** lần kiểm chứng theo `docs/workflows/verify.md` (Claude Code: agent `verifier-security`/`verifier-db`; hoặc agent khác với agent đã viết code). Không thuộc diện → bỏ qua.
4. Sửa các mục "Chặn merge" của verifier; chạy lại test phạm vi hẹp. Không gọi verifier lần hai trừ khi sửa chạm lại đúng phần nhạy cảm.
5. Cập nhật trong cùng commit:
   - `docs/gap-matrix.md`: dòng của việc → ✅ Xong + nhánh.
   - `docs/codemap.md`: chỉ dòng có file mới/đổi vai trò.
6. Việc chưa xong, hoặc sắp đổi agent → commit phần đã xong, ghi `docs/handoff/<nhánh>.md` theo `docs/handoff/TEMPLATE.md` (ghi rõ agent vừa làm). Xong hẳn → xóa handoff và plan của nhánh.
7. Đề xuất commit message; không tự push.

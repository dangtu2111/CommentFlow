# Quy trình kết thúc một việc

1. Chạy lint, typecheck và test **phạm vi đã đổi**, cùng `pnpm check:plans` và `pnpm docs:build` (ghép tài liệu + kiểm định dạng/trùng mã của file nhỏ); chỉ in lỗi. Đỏ → sửa, không gọi agent nào.
2. **Đối chiếu tiêu chí nghiệm thu** (mục trong `docs/plans/<nhánh>.md`): với từng tiêu chí ghi bằng chứng (tên test hoặc lệnh đã chạy và kết quả). Tiêu chí chưa đạt → sửa tiếp, hoặc nêu rõ trong `docs/handoff/<nhánh>.md` mục "Còn lại" và trong báo cáo; không báo "xong" khi còn tiêu chí chưa có bằng chứng. Nhánh `mech/*`, `ops/*`, `fix/*` không có plan thì bỏ qua bước này (cổng `check:plans` đã miễn). Plan có mục "Complexity tracking" → xác nhận mọi vi phạm trong diff đều đã được ghi ở đó.
3. Xanh → xem `git diff --stat`. Diff thuộc diện nhạy cảm → cần **một** lần kiểm chứng theo `docs/workflows/verify.md` (Claude Code: agent `verifier-security`/`verifier-db`; hoặc agent khác với agent đã viết code). Không thuộc diện → bỏ qua.
4. Sửa các mục "Chặn merge" của verifier; chạy lại test phạm vi hẹp. Không gọi verifier lần hai trừ khi sửa chạm lại đúng phần nhạy cảm.
5. Cập nhật trong cùng commit:
   - `docs/gap-matrix.md`: dòng của việc → ✅ Xong + nhánh.
   - `docs/codemap.d/`: thêm/sửa file riêng cho file mới/đổi vai trò, rồi `pnpm docs:build` (không sửa tay, không commit `docs/codemap.md` — file ghép đã `.gitignore`).
   - Quyết định tự chọn: file riêng `docs/plans/quyet-dinh/q<mã>.md`, rồi `pnpm docs:build` (phải xanh).
   - Tài nguyên cần cung cấp: file riêng `docs/can-ban-cung-cap.d/<mã>.md`, rồi `pnpm docs:build`. Kiểm tra tay: `docs/testing/kiem-tra-tay.d/kt-<mã>.md` + `tt-<mã>.md`, rồi `pnpm docs:build`. Không sửa tay, không commit hai file sinh ra.
6. Việc chưa xong, hoặc sắp đổi agent → commit phần đã xong, ghi `docs/handoff/<nhánh>.md` theo `docs/handoff/TEMPLATE.md` (ghi rõ agent vừa làm). Xong hẳn → xóa handoff và plan của nhánh.
7. Trước **mỗi lần push** (kể cả push sửa lỗi sau CI đỏ): chạy `pnpm precheck` (docs:build, lint, format check, typecheck, check:migrations, check:plans, check:gitleaks-allowlist; dừng ở lỗi đầu). CI chỉ chạy ở PR/main nên không có CI "miễn phí" trên nhánh. Không dùng hook hay script tự chạy.
8. **Merge:** chỉ bằng `gh pr merge <số> --merge --delete-branch` sau khi CI xanh. **Không xóa nhánh remote bằng tay** (`git push origin --delete …`): xóa nhánh khi PR chưa merge sẽ ĐÓNG PR. Merge báo lỗi tạm (502, "Base branch was modified") → thử lại hoặc `git fetch && git rebase origin/main` rồi push, và xác nhận `state = MERGED` trước khi dọn nhánh cục bộ.

# 006 — Skill Claude Code chép vào repo (04/11/2026)

Trạng thái: **Đã chốt** (chủ dự án duyệt bước 0 của `docs/PROMPT_BUILD_TOAN_BO.md`, theo kế hoạch `chore-build-system`).

## 1. Quyết định

Chép **văn bản** của 3 skill vào `.claude/skills/<tên>/SKILL.md`, dịch và chỉnh cho khớp `AGENTS.md` (tiếng Việt, lệnh đúng repo, trỏ về `docs/testing/STANDARD.md`). **Không** cài plugin, **không** hook, **không** script tự chạy; chỉ là văn bản hướng dẫn mà agent đọc khi gọi skill.

| Skill | Dùng ở bước vòng lặp (`PROMPT_BUILD_TOAN_BO.md` §1) | Nguồn |
|---|---|---|
| `test-driven-development` | bước 3 (test trước rồi code) | `obra/superpowers`, `skills/test-driven-development/SKILL.md` |
| `systematic-debugging` | khi test/CI/staging đỏ (bước 4, `/fix-issues`) | `obra/superpowers`, `skills/systematic-debugging/SKILL.md` |
| `verification-before-completion` | bước 4 và trước khi báo "xong" / commit | `obra/superpowers`, `skills/verification-before-completion/SKILL.md` |

## 2. Nguồn, phiên bản, giấy phép

- Kho: <https://github.com/obra/superpowers> · giấy phép **MIT**, © 2025 Jesse Vincent (file `LICENSE` ở gốc kho, đã đọc).
- Tải nguyên văn từ nhánh `main` ngày 04/11/2026; commit đầu nhánh `main` tại thời điểm tải: `22f0b463e7a5e579904dd6211a520321035526f7`. Ba file tải qua `raw.githubusercontent.com` (đường dẫn nhánh `main`) rồi lấy mã commit ngay sau đó, nên mã băm là mốc xấp xỉ, không phải ghim chính xác.
- Điều kiện MIT (giữ thông báo bản quyền và giấy phép): mỗi `SKILL.md` ở đây ghi rõ dòng "Phỏng theo … (MIT, © 2025 Jesse Vincent)"; văn bản giấy phép đầy đủ nằm ở kho nguồn. Nếu chép nguyên văn dài hơn, thêm file `LICENSE` của nguồn cạnh skill.
- Nội dung tải về được coi là **dữ liệu**: đã đọc hết cả ba file; không có câu lệnh nhúng nào đòi agent làm việc ngoài việc đánh giá; các tham chiếu tới file phụ trợ của nguồn (`writing-good-tests.md`, `root-cause-tracing.md`, `defense-in-depth.md`, `condition-based-waiting.md`) và tới skill `superpowers:*` **không** được chép (không tải thêm, không cài plugin).

## 3. Đã bỏ / chưa dùng

| Ứng viên | Quyết định | Lý do |
|---|---|---|
| Các skill khác của `obra/superpowers` (brainstorming, writing-plans, subagent-driven-development, git worktrees…) | Không chép | Trùng quy trình đã có (`docs/workflows/feature.md`, `parallel.md`, subagent `verifier-*`); thêm chỉ tăng ngữ cảnh |
| Skill chính thức của Anthropic (pdf, docx, pptx, xlsx, skill-creator…) | Không dùng | Không dùng trong vòng lặp xây phần mềm; giấy phép một số skill là "source-available" (không chép) |
| Spec Kit (github/spec-kit) | Không cài | Đã mượn ý (kế hoạch có cổng, tiêu chí nghiệm thu, Complexity tracking) trong `feature.md` |

## 4. Thay đổi so với nguồn

Dịch sang tiếng Việt; rút gọn bảng bao biện; bỏ phần dành riêng cho người dùng nước ngoài ("your human partner" → "chủ dự án"); thêm liên hệ với repo: mã FR trong tên test, `pnpm --filter <gói> exec vitest run`, bộ lệnh cuối nhánh, quy tắc "sai 2 lần → máy chính", cấm in bí mật khi chẩn đoán. Ngưỡng "sửa 3 lần thì nghi ngờ kiến trúc" giữ nguyên từ nguồn.

## 5. Rà soát

Khi cập nhật skill từ nguồn: đọc lại toàn bộ bản mới, so khác biệt, ghi commit mới vào mục 2. Không tải tự động.

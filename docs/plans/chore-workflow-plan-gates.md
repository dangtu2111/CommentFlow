# Kế hoạch `chore/workflow-plan-gates` — cổng kế hoạch mượn ý từ Spec Kit

## Việc

Mã gap matrix: không có (việc quy trình) · Spec: `AGENTS.md` § Không làm trùng việc, `docs/workflows/feature.md`, `finish.md`.

**Tóm tắt:** thêm một cổng kiểm kế hoạch chạy bằng công cụ (không dùng AI): plan đã duyệt không được còn điểm chưa rõ, và nhánh `feat/*`, `chore/*` phải có plan của mình; nhánh `mech/*`, `ops/*`, `fix/*` được miễn. Vì sao: tránh code khi yêu cầu còn mơ hồ nhưng không làm chậm việc cơ học/hạ tầng/sửa lỗi nhỏ. Rủi ro: cổng sai làm đỏ CI oan (đã giảm bằng test, và bỏ qua khi không đọc được lịch sử git).

## Điểm chưa rõ

Không có. (Chủ dự án đã chốt 03/11: không làm hook PreToolUse; giữ `check:plans` ở CI + `/finish`; miễn plan cho `mech/*`, `ops/*`, `fix/*` nhỏ từ `/fix-issues`; chưa mở PR cho tới khi `feat/auth-ui` merge, rebase lên `main`, CI xanh.)

## Tiêu chí nghiệm thu

1. Plan đã duyệt còn thẻ chưa-rõ / ô chưa tick / tiêu chí rỗng thì `pnpm check:plans` thoát 1 — kiểm bằng: `scripts/lib/plan-gate.test.mjs`.
2. `feat/*` và `chore/*` không có plan (đang tồn tại hoặc từng được thêm trong lịch sử nhánh) thì đỏ; plan bị xóa lúc kết thúc việc vẫn được tính — kiểm bằng: `plan-gate.test.mjs` (`checkBranchPlan`) và `plan-history.test.mjs` (repo git tạm).
3. `mech/*`, `ops/*`, `fix/*`, `main` và tiền tố lạ được miễn; nhánh `fix/*` có file plan thì file đó vẫn bị kiểm — kiểm bằng: `planRequirement` test + chạy CLI với `--branch`.
4. Không đọc được lịch sử (clone nông) thì không báo lỗi oan — kiểm bằng: `plan-history.test.mjs`.
5. CI chạy cổng với lịch sử đầy đủ (`fetch-depth: 0`) — kiểm bằng: job Node của CI xanh trên nhánh này.

## File sẽ đọc (≤ ~8, kèm lý do)

Đã đọc: `docs/workflows/feature.md`, `finish.md`, `docs/plans/README.md`, `.github/workflows/ci.yml`, `AGENTS.md` (§ Hai máy: tiền tố nhánh `mech/*`, `ops/*`, `fix/*`).

## File sẽ sửa / tạo

`scripts/lib/plan-gate.mjs` (+ `planRequirement`, `checkBranchPlan`), `scripts/lib/plan-history.mjs` (mới), `scripts/check-plans.mjs`, hai file test, `.github/workflows/ci.yml` (`fetch-depth: 0`), `docs/workflows/feature.md`, `finish.md`, `docs/plans/README.md`.

## Migration

Không có.

## Test viết trước

Bảng tiền tố nhánh; `checkBranchPlan` (có plan, đã xóa nhưng từng thêm, plan nhánh khác, lịch sử `null`); repo git tạm cho `plansAddedSince`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/scripts test` · `pnpm check:plans` · `pnpm lint`.

## Cần kiểm chứng độc lập không?

Không (công cụ quy trình, không thuộc diện nhạy cảm).

## Rủi ro / câu hỏi cho chủ dự án

Sau khi `feat/auth-ui` merge: rebase nhánh này lên `main`, chạy lại CI rồi mới mở PR. Plan này (và handoff nếu có) xóa ở commit kết thúc.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có (không thêm thư viện; chỉ dùng `git` qua `child_process`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 03/11) kèm các quyết định ở mục "Điểm chưa rõ".

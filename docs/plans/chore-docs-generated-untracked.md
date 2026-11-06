# Kế hoạch `chore/docs-generated-untracked` — ngừng commit bốn file tài liệu ghép tự sinh

> Trạng thái duyệt: **Đã duyệt** (chủ dự án chốt 06/11/2026: "làm triệt để xung đột" giữa các PR song song; đây là PR 1/3).

## Việc

Mã gap matrix: không (hạ tầng quy trình) · Spec: `docs/workflows/parallel.md`.

**Tóm tắt:** 3 giờ qua `docs/plans/QUYET_DINH_CHO_DUYET.md` bị 34 PR cùng sửa, `docs/codemap.md` 33, `docs/testing/KIEM_TRA_TAY.md` 26. Nguyên nhân: các file GHÉP TỰ SINH vẫn được commit, nên hai PR cùng ghép lại thì cùng sửa vùng cuối file. Giải pháp: ngừng commit bốn file ghép (`git rm` + `.gitignore`), thêm `pnpm docs:build` sinh lại cả bốn từ thư mục `*.d`, và thay các lệnh `*:check` (so bản ghép với bản commit) bằng kiểm định dạng + độc nhất mã của file nhỏ. Không đổi nội dung: bản ghép mới đúng từng byte với bản đã commit. Rủi ro: PR khác đang mở sửa file ghép sẽ xung đột "sửa/xóa" một lần — cách gỡ: `git rm <file>` rồi `pnpm docs:build`.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Bản ghép mới == bản commit cũ trước khi gỡ — kiểm bằng: chạy `pnpm docs:build` trên `origin/main`, `git diff` rỗng (đã làm).
2. Bốn file ghép không còn trong chỉ mục và bị `.gitignore`; các thư mục `*.d` vẫn được commit — kiểm bằng: `git ls-files`, `git check-ignore`.
3. `pnpm docs:build` ghép đủ bốn bộ và đỏ khi file nhỏ sai định dạng hoặc trùng mã Q/KT — kiểm bằng: `scripts/lib/docs-check.test.mjs`.
4. `precheck` chạy `docs:build` đầu tiên; CI có bước `pnpm docs:build` thay cho bốn `*:check` — kiểm bằng: `precheck.test.mjs`, đọc diff `ci.yml`.
5. AGENTS.md, workflows, template orchestrator, codemap dặn "chạy docs:build đầu phiên; chỉ thêm FILE RIÊNG, không commit file ghép" — kiểm bằng: đọc diff.

## File sẽ đọc

`scripts/build-*.mjs`, `scripts/lib/{fragments,fragments-cli,precheck}*.mjs`, `package.json`, `.github/workflows/ci.yml`, `AGENTS.md`, `docs/workflows/{finish,feature}.md`, `tools/orchestrator/templates/HEAD.md`.

## File sẽ sửa / tạo

`scripts/lib/docs-targets.mjs` (mới, khai báo 4 bộ), `scripts/lib/docs-check.mjs` (+test, mới), `scripts/build-docs.mjs` (mới), bốn `scripts/build-*.mjs` (mỏng lại), `scripts/lib/fragments-cli.mjs`, `fragments.mjs` (+test: bỏ `diffAgainst`), `precheck.mjs` (+test), `package.json`, `.gitignore`, `.github/workflows/ci.yml`, `AGENTS.md`, `docs/workflows/finish.md`, `feature.md`, `tools/orchestrator/templates/HEAD.md`, ba file `docs/codemap.d/lenh-*.md`; gỡ khỏi git: bốn file ghép.

## Migration

Không có.

## Test viết trước

`scripts/lib/docs-check.test.mjs`: mã Q trùng, hàng sai định dạng, KT lệch tên file, file mồ côi.

## Lệnh test phạm vi hẹp

`pnpm --filter ./scripts exec vitest run lib`; `pnpm docs:build`.

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/migration/gửi).

## Rủi ro / câu hỏi cho chủ dự án

Không còn `*:check` so với bản commit: nội dung file ghép luôn là kết quả của file nhỏ nên không thể "lệch"; lỗi nằm ở file nhỏ và bị `docs:build` bắt.

# Kế hoạch `chore/push-safe` — Lệnh `pnpm push:safe`

## Việc

Mã gap matrix: `EVAL-RELIABILITY` (quy trình) · AGENTS.md § Lệnh.

**Tóm tắt:** Lỗi "precheck đỏ mà vẫn push" đã lặp 3 lần vì lệnh kiểm bị nối qua ống lọc output (mất mã thoát). Việc này thêm một lệnh duy nhất `pnpm push:safe`: chạy `pnpm precheck`, chỉ `git push` khi mã thoát = 0, in rõ lỗi nếu đỏ, không nhận `--force`/xóa nhánh. Không hook. Ghi vào AGENTS.md: chỉ push bằng lệnh này. Rủi ro thấp (chỉ script vận hành).

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Precheck mã thoát ≠ 0 (kể cả null) → không gọi push, in "KHÔNG push", thoát ≠ 0 — kiểm bằng: `scripts/lib/push-safe.test.mjs`.
2. Precheck xanh → push với tham số đúng (chưa có upstream → `-u origin HEAD`) và trả mã thoát của push — kiểm bằng: cùng test.
3. `--force`, `-f`, `--force-with-lease`, `+refspec`, `--delete`, `--mirror` bị từ chối trước cả precheck — kiểm bằng: cùng test.
4. AGENTS.md ghi "chỉ push bằng `pnpm push:safe`" và cấm ống lọc giữa kiểm và push — kiểm bằng: đọc `AGENTS.md` § Lệnh.

## File sẽ đọc (≤ ~8, kèm lý do)

`scripts/precheck.mjs`, `scripts/lib/precheck.mjs` (mẫu), `AGENTS.md`, `package.json`.

## File sẽ sửa / tạo

Tạo `scripts/push-safe.mjs`, `scripts/lib/push-safe.mjs`, `scripts/lib/push-safe.test.mjs`, `docs/codemap.d/lenh-push-safe.md`; sửa `package.json` (script), `AGENTS.md`.

## Migration

Không có.

## Test viết trước

Logic quy tắc "chỉ push khi mã thoát 0" và danh sách tham số cấm: test viết cùng lúc với lõi thuần (`runPushSafe`, `buildPushArgs`).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/scripts exec vitest run lib/push-safe.test.mjs`

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Không có. Agent vẫn có thể gõ `git push` trực tiếp (không hook theo yêu cầu); quy tắc nằm ở AGENTS.md.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

Đã duyệt (chủ dự án yêu cầu 08/11/2026).

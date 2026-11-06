# Kế hoạch `chore/orchestrator-kit` — Bộ công cụ điều phối làn dùng lại

## Việc

Mã gap matrix: không có (việc hạ tầng quy trình) · Spec: `docs/workflows/parallel.md`, `AGENTS.md` § Quy tắc hỏi / § Tài nguyên ngoài.

**Tóm tắt:** Đóng gói quy trình điều phối nhiều làn song song (agent làm việc → PR → chờ CI → merge/sửa/kẹt) thành công cụ Node cấu hình bằng một file JSON, kèm prompt khung, tài liệu và bài học. Mục đích: dùng lại cho dự án khác, không cứng đường dẫn/tên dự án. Rủi ro thấp: không chạm mã sản phẩm; điều phối chỉ chạy lệnh git an toàn (không push/rebase/force).

Ghi chú: các file driver/prompt mẫu ở thư mục tạm của phiên điều phối không đọc được từ phiên này (ngoài thư mục làm việc cho phép); thiết kế dựa trên mô tả của chủ dự án.

## Điểm chưa rõ

Không có. (Quyết định tự chọn: công cụ nằm trong repo, tách riêng sau — ADR 012.)

## Tiêu chí nghiệm thu

1. Phân tích bước `task:`/`fix:`/`wait:` đúng và từ chối bước sai — kiểm bằng: `pnpm --filter @flow/orchestrator test`.
2. Chỉ đếm CI đỏ sau khi hết check pending; sau bản sửa chờ commit mới — kiểm bằng: test `waitForChecks`.
3. Tối đa 2 lần sửa/PR, phát hiện lặp NGUYÊN NHÂN GỐC, quyết định merge/sửa/kẹt — kiểm bằng: test `decidePr` + `runLane`.
4. Tìm PR theo tên nhánh (có biến thể `/`↔`-`); không bao giờ gọi git push/rebase/add — kiểm bằng: test `branches`, `safe-git`.
5. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check:plans` xanh — kiểm bằng: chạy lệnh.

## File sẽ đọc (≤ ~8, kèm lý do)

`docs/workflows/parallel.md`, `AGENTS.md`, `docs/codemap.md` (dòng cần thêm), `scripts/lib/plan-gate.mjs` (cổng plan), `scripts/package.json` (mẫu package test Node).

## File sẽ sửa / tạo

`tools/orchestrator/**` (mã, template, config mẫu, test), `docs/workflows/orchestrator.md`, `docs/decisions/012-orchestrator-kit.md`, `AGENTS.md` (một dòng trỏ), `docs/codemap.md` (một dòng), `.gitignore` (`.orchestrator/`), `pnpm-lock.yaml` (importer mới, vitest đã có).

## Migration

Không có.

## Test viết trước

Logic thuần (parse bước, so nguyên nhân, quyết định, phân loại CI, an toàn git, cấu hình) và `runLane` với `gh`/`git`/agent giả lập.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/orchestrator test`

## Cần kiểm chứng độc lập không?

Không (không thuộc diện nhạy cảm).

## Rủi ro / câu hỏi cho chủ dự án

Phần chạy thật (`gh`, `claude`) chưa được thử đầu-cuối — chỉ có test giả lập; nên thử `--dry-run` rồi một việc nhỏ trước khi xếp hàng dài.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có (không thêm thư viện; vitest đã dùng ở repo).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (chủ dự án yêu cầu trực tiếp việc này, 06/11/2026).

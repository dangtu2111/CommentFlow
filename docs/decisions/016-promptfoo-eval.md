# 016 — promptfoo cho EVAL-RUNNER (đánh giá AI)

Trạng thái: chủ dự án duyệt 07/11/2026. Phạm vi: `tools/eval/`, `docs/14_Test_Plan.md` §4.

## Quyết định
Dùng **promptfoo** làm khung chạy/đối chiếu bộ đánh giá AI, đúng spec `docs/14` §4 (ban đầu ghi "chạy CI"; hiện chạy tay vì cần khóa LLM và tốn tiền).

## Giấy phép và phiên bản (đã kiểm trên npm ngày 07/11/2026)
| | |
|---|---|
| Gói | `promptfoo` |
| Phiên bản ghim | **0.125.1** |
| Giấy phép | **MIT** (trường `license` của gói trên npm; kho `github.com/promptfoo/promptfoo`) |
| Yêu cầu | Node ≥ 22.22 (dự án dùng Node 24) |
| Kích thước | ~33 MB giải nén + phụ thuộc |

MIT cho phép dùng, sao chép, sửa, phân phối kể cả thương mại; chỉ yêu cầu giữ thông báo bản quyền. Dùng làm **công cụ phát triển/đánh giá**, không nhúng vào mã sản phẩm và không phân phối cùng sản phẩm. Phụ thuộc bắc cầu của promptfoo không được kiểm từng cái; trước khi đưa promptfoo vào chuỗi CI hoặc đóng gói, phải rà giấy phép phụ thuộc bắc cầu.

## Cách tích hợp (không thêm vào lockfile)
- Chạy bằng `pnpm dlx promptfoo@0.125.1` (script `pnpm --filter @flow/eval promptfoo`): **không** thêm vào `package.json`/`pnpm-lock.yaml`, nên `pnpm install --frozen-lockfile` của CI không phải cài thêm ~hàng trăm gói.
- Lớp nối mỏng: `tools/eval/promptfoo/provider.mjs` (provider tùy chỉnh) gọi `src/promptfoo-entry.ts`, dùng lại ĐÚNG bộ chạy (`createRunner`) và bộ chấm (`checkSample`) của `pnpm --filter @flow/eval evaluate`, nên số liệu hai đường là MỘT. Test của promptfoo sinh bằng `pnpm --filter @flow/eval gen:promptfoo` (`promptfoo/tests.json`, không commit).
- Báo cáo chính (chỉ số §4.2 theo nhóm ngôn ngữ + chi phí/1.000 lượt tách theo bước extract/rewrite/draft + kiểm token suy luận ≈ 0) do `evaluate` sinh; promptfoo bổ sung giao diện so sánh nhiều cấu hình model (`promptfoo view`).

## Giới hạn đã biết
- Đã chạy thử promptfoo với backend `mock` (56 test, 0 lỗi, các `metric` theo tên được tổng hợp). CHƯA chạy promptfoo với model thật qua LiteLLM (chờ khóa trên máy ảo).
- Bộ `synthetic` chỉ để chạy thử runner; chọn model và báo đạt Cổng 2 cần bộ ~300 bình luận thật (`EVAL-SET-REAL`).

## Đảo ngược
Xóa `tools/eval/promptfoo/` và script `promptfoo`; `pnpm evaluate` vẫn chạy độc lập vì không phụ thuộc promptfoo.

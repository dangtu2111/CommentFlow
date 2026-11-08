# Kế hoạch `feat/eval-budget-guard` — Trần chi phí cho EVAL chạy qua LiteLLM

Mã gap matrix: `EVAL-RELIABILITY` · Tiếp theo `docs/plans/feat-eval-production-path.md` (#282, đã merge).

**Tóm tắt:** Chủ dự án cho phép thường trực chạy EVAL qua LiteLLM với trần: mỗi lần đo ≤ 1 USD, tổng chuỗi việc ≤ 5 USD, báo chi phí thật (LiteLLM + `ai_usage`) trong mỗi báo cáo, khóa ảo tiêu > 80% trần thì dừng hỏi. Việc này thêm các cổng đó vào EVAL. Rủi ro thấp: chỉ công cụ đo, không đổi ứng dụng.

## Điểm chưa rõ

Không có (yêu cầu chốt 08/11/2026).

## Tiêu chí nghiệm thu

1. `decideBudget` dừng khi lượt kế tiếp vượt trần một lần đo, vượt tổng sổ chi tiêu, hoặc khóa ảo > 80% trần của khóa — kiểm bằng: `budget.test.ts`.
2. Đọc chi tiêu khóa bằng `/key/info` với chính khóa EVAL dùng (không đọc tệp bí mật); lỗi → không dừng theo khóa — kiểm bằng: `budget.test.ts`.
3. Báo cáo ghi chi phí lần đo (LiteLLM), `ai_usage` thật, tổng theo sổ, chi tiêu khóa; dừng sớm thì ghi rõ và thoát mã 3 — kiểm bằng: chạy thật hai bộ số nền (khớp $0,1588 và $0,0423 giữa LiteLLM và ai_usage).

## File sẽ sửa

`tools/eval/src/{budget.ts,budget.test.ts,cli/run.ts}`, docs.

## Migration

Không có.

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Không có.

## Complexity tracking

Không có.

## Trạng thái duyệt

Đã duyệt (yêu cầu của chủ dự án 08/11/2026).

# Kế hoạch `fix/eval-product-matcher-prod` — nhóm (1) sửa lỗi (a): bộ khớp sản phẩm của EVAL như production

**Trạng thái duyệt:** Đã duyệt (chủ dự án chốt thứ tự sửa (a) ngày 08/11/2026, Q-EV2-8).

## Việc

**Tóm tắt:** Bộ khớp sản phẩm của EVAL ("tên chứa nguyên văn lời nhắc") quá chặt với tên dài của Shopify nên 5 mẫu tiếng Anh lệch vì công cụ đo, không phải lõi AI. Thay bằng bộ khớp ĐÚNG như production: `similarity`/`word_similarity` của pg_trgm (ngưỡng 0,3/0,4), bí danh 0,6, chọn/mơ hồ `pickProductMatch` (0,45/0,05), chạy qua một truy vấn thuần (không ghi/đọc bảng). Mặc định `--matcher trigram` khi chạy qua LiteLLM (cần DB dev/test); `--matcher substring` giữ bản cũ để so. Chạy lại cả hai bộ, báo bảng trước/sau.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Lời nhắc rút gọn nằm trong tên dài vẫn khớp; lời nhắc chung chung cho nhiều ứng viên (mơ hồ) như production; chuỗi lạ không khớp — kiểm bằng: `tests/shop-trigram.int.test.ts` (pg_trgm thật).
2. `--matcher` hoạt động, cổng chỉ `cf_dev`/`cf_test` — kiểm bằng: chạy CLI, typecheck.
3. Bảng trước/sau của cả hai bộ — kiểm bằng: báo cáo (tools/eval/out, tóm tắt trong báo cáo cuối nhóm).

## File sẽ sửa

`tools/eval/src/{shop,shop-trigram,runner,cli/run}.ts`, `tools/eval/tests/shop-trigram.int.test.ts`, `tools/eval/vitest.int.config.ts`, `tools/eval/package.json`.

## Migration

Không có.

## Cần kiểm chứng độc lập không?

Không (công cụ đo).

## Rủi ro / câu hỏi cho chủ dự án

Bộ khớp như production phơi ra điểm yếu THẬT của production (ví dụ "gối massage" khớp súng massage; lời nhắc chung chung thành mơ hồ nhiều ứng viên): số đo sau nhóm này phản ánh production, không còn "đẹp" hơn thật.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.

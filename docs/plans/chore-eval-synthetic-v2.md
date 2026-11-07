# Kế hoạch `chore/eval-synthetic-v2` — đưa bộ synthetic v2 vào EVAL-RUNNER, chạy qua LiteLLM, phân loại lệch

**Trạng thái duyệt:** Đã duyệt (chủ dự án yêu cầu 08/11/2026: kiểm hai bộ đúng schema, xuất cửa hàng sswiftly, chạy, phân loại từng câu lệch rồi mới làm `feat/kb-tryai-redesign`).

## Việc

Mã gap matrix: `EVAL-RUNNER` (bộ synthetic v2). **Tóm tắt:** thêm hai bộ synthetic v2 (đáp án gán theo spec) vào `tools/eval/datasets/`, mở rộng cửa hàng mẫu cho tiền tệ khác VND, xuất `shops/sswiftly.json` từ Shop Thử 2 (dev), chạy EVAL qua LiteLLM, báo theo nhóm ngôn ngữ và phân loại từng mẫu lệch (a/b/c). KHÔNG sửa code lõi để khớp đáp án; mục (b) ghi Q-EV2-1…7 chờ chủ dự án chốt.

## Điểm chưa rõ

Không có (các điểm mơ hồ của spec đã thành Q-EV2-1…7).

## Tiêu chí nghiệm thu

1. Hai bộ đúng schema, có test giữ lại — kiểm bằng: `datasets.test.ts`.
2. `shops/sswiftly.json` xuất được bằng lệnh có cổng chỉ-`cf_dev`, giá USD đúng đơn vị nhỏ nhất — kiểm bằng: `datasets.test.ts` (sswiftly), chạy `export-shop`.
3. Giá trong `mustContain` đối chiếu với dữ liệu thật; dòng sai (nếu có) được ghi lại — kiểm bằng: báo cáo mục 1 (0 dòng sai).
4. Chạy cả hai bộ qua LiteLLM; báo theo nhóm: nhãn, hành động, tách thông tin, sai giá, chi phí/1.000 lượt — kiểm bằng: `docs/testing/eval-synthetic-v2-2026-11-08.md`.
5. Mỗi mẫu lệch được phân loại (a)/(b)/(c); (b) ghi vào `QUYET_DINH_CHO_DUYET.md` — kiểm bằng: báo cáo mục 3 + `q-ev2-1…7.md`.

## File sẽ sửa / tạo

`tools/eval/src/{shop,cli/export-shop,datasets.test}.ts`, `tools/eval/package.json` (thêm `pg` 8.23.1 đã dùng ở repo, script `export-shop`), `tools/eval/datasets/{synthetic-v2-*.jsonl,shops/sswiftly.json}`, tài liệu: báo cáo, Q-EV2-1…7, gap-matrix.

## Migration

Không có.

## Cần kiểm chứng độc lập không?

Không (công cụ đo, không đụng đường chạy thật).

## Rủi ro / câu hỏi cho chủ dự án

`shops/sswiftly.json` là danh mục sản phẩm thật của Shop Thử 2 (công khai trên Shopify, không có dữ liệu khách); nếu không muốn đưa vào repo, bỏ tệp này khỏi commit và giữ cục bộ.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.

# Đo `distill@2` trên Shop Thử 2 (12/11/2026)

**Mục đích:** PR5 đổi prompt chắt lọc `distill@1` → `distill@2` (thêm loại `shop_field`). Đo xem FAQ chắt lọc có tệ đi không trước khi bật `cf.ai.distill` rộng. Không bật cờ cho workspace nào (lệnh chạy tay không kiểm cờ).

**Cách đo:** `pnpm --filter @flow/worker kb:distill -- e8f9e1e3-a805-491a-81d5-0612fec8d6a2 --force-first 20` (workspace Shop Thử 2, `cf_dev`; cờ mới `--force-first N` chỉ xét N đoạn đầu theo `chunk_key` và bỏ qua `distill_hash`). LLM thật qua LiteLLM, trần 0,20 USD.

## Kết quả

| | 11/11 (distill@1) | 12/11 (distill@2, 20 đoạn đầu) |
|---|---|---|
| Đoạn xét | 25 đủ điều kiện (24 sinh nháp) | 20 (đoạn 1–20 theo `chunk_key`; 19 từng sinh nháp) |
| Nháp FAQ/thuộc tính | **103** (102 faq + 1 product_attr); riêng 20 đoạn đầu: **86** (19 đoạn, 1 product_attr) | đạt kiểm cứng **54** (= 59 − 5 `shop_field`); ghi mới **34** (20 trùng câu hỏi đã có), 34 faq từ 11 đoạn, 0 product_attr |
| Mục `shop_field` | — | đạt 5 → ghi 2 đề xuất (`description`, `name`; còn lại trùng hồ sơ hoặc trùng trường trong lượt chạy) |
| Bị loại theo lý do | **không có số liệu** (chỉ in ra log lúc chạy, không lưu DB) | `quote_not_in_source` 1; còn lại 0 (`digit_not_in_quote`, `money_in_answer`, `placeholder_in_text`, `invalid_shop_field`) |
| Đầu ra hỏng / mục sai cấu trúc | không có số liệu | 0 / 0 |
| Chi phí | không có số liệu | **0,0085 USD** (trần 0,20) |

## Đọc kết quả

- **Chất lượng kiểm cứng không tệ đi:** 59 mục thì chỉ 1 bị loại (trích dẫn không có trong nguồn); không số tiền, không chữ số bịa, không đầu ra hỏng.
- **Sản lượng FAQ thấp hơn đáng kể:** 54 so với 86 nháp của cùng 20 đoạn (≈ −37%; 2,7 so với 4,3 mục/đoạn), và không còn mục `product_attr` nào. Nguyên nhân CHƯA xác định: có thể do prompt mới (thêm loại `shop_field`, bắt đặt `field`), do khác biệt giữa các lần gọi LLM, hoặc so sánh lệch (86 là số nháp SAU khi bỏ trùng ở 11/11, còn 54 là số đạt kiểm cứng TRƯỚC khi bỏ trùng với 103 nháp sẵn có — nên chênh lệch thật có thể nhỏ hơn). 34 câu mới khác 103 câu cũ chứng tỏ cùng đoạn cho ra câu hỏi khác nhau giữa hai lần.
- **Không đủ dữ liệu để kết luận hồi quy.** Số liệu 11/11 theo lý do bị loại không được lưu nên không so được chi tiết.

## Đề xuất

1. Chưa bật `cf.ai.distill` rộng; giữ Shop Thử 2 như hiện tại.
2. Muốn kết luận chắc: chạy lại cùng 20 đoạn bằng prompt `distill@1` (cùng LLM, cùng `--force-first 20`) để so trực tiếp số đạt kiểm cứng và lý do loại — chi phí khoảng 0,01 USD; cần tạm giữ lại prompt cũ (không làm khi chưa có lệnh).
3. Nếu `distill@1` cũng cho ~54 mục thì chênh lệch là nhiễu giữa các lần gọi, không phải do prompt mới.

**Tác dụng phụ ở Shop Thử 2 (`cf_dev`):** thêm 34 FAQ nháp (`status = draft`, chưa vào tìm kiếm, Owner duyệt hay bỏ ở tab "Chờ duyệt") và 2 đề xuất thông tin shop (nháp). Không đổi dữ liệu đã duyệt/xuất bản.

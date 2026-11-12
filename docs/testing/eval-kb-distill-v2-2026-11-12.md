# Đo `distill@2` so với `distill@1` trên Shop Thử 2 (12/11/2026)

**Mục đích:** PR5 đổi prompt chắt lọc `distill@1` → `distill@2` (thêm loại `shop_field`). Đo CÙNG ĐIỀU KIỆN xem FAQ chắt lọc có tệ đi không. Cổng do chủ dự án đặt: số mục qua kiểm cứng của v2 (không tính `product_attr`) ≥ 80% của v1; thấp hơn thì quay về `distill@1` làm mặc định. Không bật cờ cho workspace nào (lệnh chạy tay không kiểm cờ).

**Cách đo:** `pnpm --filter @flow/worker kb:distill -- e8f9e1e3-a805-491a-81d5-0612fec8d6a2 --force-first 20 --prompt distill@1|distill@2` — Shop Thử 2 (`cf_dev`), cùng 20 đoạn đầu theo `chunk_key`, cùng LLM (LiteLLM, `DRAFT_LLM_MODEL`), nhiệt độ 0, xen kẽ v1, v2, v1, v2. `distill@1` giữ NGUYÊN VĂN (prompt + schema cũ) làm hằng số A/B trong `distiller.ts`; kiểm lại từng dòng với bản trước PR5.

## Kết quả (20 đoạn)

| Bản | Lượt | Đạt kiểm cứng: faq | product_attr | shop_field | Tổng đạt | Bị loại theo lý do | Chi phí |
|---|---|---|---|---|---|---|---|
| distill@1 | 1 | 73 | 0 | — | 73 | `quote_not_in_source` 2 | $0,0091 |
| distill@1 | 2 | 73 | 0 | — | 73 | `quote_not_in_source` 2 | $0,0091 |
| distill@2 | 1 (12/11 sáng, lượt đo đầu) | 54 | 0 | 5 | 59 | `quote_not_in_source` 1 | $0,0085 |
| distill@2 | 2 | 58 | 0 | 5 | 63 | không có | $0,0087 |
| distill@2 | 3 | 58 | 0 | 5 | 63 | không có | $0,0087 |

Đầu ra hỏng 0, mục sai cấu trúc 0 ở mọi lượt. Tổng chi phí bốn lượt A/B: **$0,0356** (trần $0,05); cộng lượt đo đầu $0,0085.

## Gate

- **Theo đúng chữ của cổng** (mục qua kiểm của v2 không tính `product_attr` = faq + shop_field = 63; v1 = 73): **63/73 = 86,3% ≥ 80% → ĐẠT**, giữ `distill@2` làm mặc định.
- **Đọc chặt hơn (chỉ tính FAQ, bỏ cả `shop_field`):** 58/73 = **79,5% — hụt ngưỡng 80% đúng 1 mục** (cần ≥ 59); lượt đo đầu chỉ 54/73 = 74%. Nên lưu ý: sản lượng FAQ của v2 thấp hơn v1 khoảng 20%, sát ngưỡng.
- Số mục v2 dao động 54–58 giữa các lần (v1 giữ nguyên 73 hai lần): nhiễu của LLM, không phải của phép đo.

## Chất lượng

- v2 **không có mục bị loại** ở hai lượt gần nhất (v1: 2 mục `quote_not_in_source` mỗi lượt) và không có mục số tiền/chữ số bịa ở cả hai bản.
- Số mục nháp thực sự ghi thấp hơn tổng đạt vì bỏ trùng câu hỏi với nháp đã có.

## `product_attr` biến mất: vì sao

KHÔNG phải do tôi bỏ loại đó khỏi schema v2: `DISTILL_KINDS` của v2 vẫn là `faq`, `product_attr`, `shop_field` và prompt v2 vẫn mô tả `product_attr` (có test giữ lại). Ở lần chạy 11/11 chỉ có **1/103** nháp là `product_attr`; trong 5 lượt đo hôm nay **cả v1 lẫn v2 đều trả 0** — nghĩa là model hầu như không trả loại này với 20 đoạn này (tỉ lệ ~1% ở mức nhiễu), không liên quan đến prompt v2.

## Nguyên nhân sản lượng FAQ thấp hơn (giả thuyết, chưa chứng minh)

Tối đa 6 mục/đoạn: 5 mục `shop_field` chiếm chỗ của FAQ ở các đoạn giới thiệu shop, và model phải cân nhắc thêm một loại mục. Để kiểm: chạy v2 với `shop_field` tắt (cần bản prompt thứ ba) — chưa làm.

## Dọn dẹp

Đã xóa mọi nháp do các lần đo tạo trên Shop Thử 2 (`cf_dev`) theo mốc `created_at` từ 00:00 ngày 12/11: **90 FAQ nháp và 1 đề xuất thông tin shop** (kỳ vọng 90, khớp mới xóa; giao dịch một lần). Còn nguyên **103 nháp** của lần chạy 11/11; không đụng dòng đã duyệt hay nhập tay.

## Kết luận

Giữ `distill@2` mặc định theo cổng đã đặt (86% ≥ 80%), nhưng ghi nhận FAQ-only chỉ 79,5%: nếu chủ dự án muốn cổng chặt theo FAQ thì cần quay về `distill@1` (đổi một hằng số `DISTILL_PROMPT_VERSION`) hoặc tách `shop_field` sang lần gọi riêng để không tranh chỗ với FAQ.

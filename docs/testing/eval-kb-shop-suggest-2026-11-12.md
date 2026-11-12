# EVAL hồi quy cho PR5 `feat/kb-shop-suggest` (12/11/2026)

**Nhãn:** bộ `synthetic` (chỉ để phát hiện lệch, không dùng báo đạt cổng). Đường trả lời KHÔNG đổi trong PR này (chỉ thêm bước đề xuất thông tin shop ở đồng bộ/chắt lọc, cờ `cf.ai.distill` mặc định tắt) nên phép đo này chỉ để chắc không có hồi quy.

**Cách đo:** 1 lượt, bộ `synthetic-v2-demo-shop.jsonl` (99 mẫu), cờ tắt, `--persist-usage`: `pnpm run evaluate --dataset datasets/synthetic-v2-demo-shop.jsonl --shop datasets/shops/demo-shop.json --repeats 1`.

| Nhóm | Chọn đúng hành động | Sự kiện bắt buộc | Bộ an toàn |
|---|---|---|---|
| Việt có dấu (37) | 97,3% (36/37) | 100% (12/12) | 100% (5/5) |
| Việt không dấu/teencode (32) | 96,9% (31/32) | 100% (12/12) | 100% (5/5) |
| Trộn Việt–Anh (30) | 96,7% (29/30) | 100% (12/12) | 100% (5/5) |

Cơ sở (`docs/testing/eval-product-match-2026-11-08.md`, demo-shop): chọn đúng hành động 91,9% / 90,9% (trộn), sự kiện bắt buộc 91,7% → lượt này **không thấp hơn cơ sở** ở mọi nhóm; guard: 0 biến thể sai nội dung, 0 sai xưng hô, 0 trả lời rỗng.

**Chi phí thật (LiteLLM):** $0,0634 cho lượt đo (trần 1 USD) — $0,640 / 1.000 lượt. Sổ cộng dồn EVAL: $1,0433 → $1,1067 (trần 5 USD). Khóa ảo LiteLLM: đã tiêu $5,06 / $10 (51%, dưới ngưỡng dừng 80%).

**Chưa đo:** chất lượng chắt lọc `distill@2` (loại `shop_field`) trên Shop Thử 2 — cần đo trước khi bật `cf.ai.distill` rộng.

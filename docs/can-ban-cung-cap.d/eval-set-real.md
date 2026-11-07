## EVAL-SET-REAL. Bộ ~300 bình luận THẬT để chọn model và báo đạt Cổng 2 — `EVAL-SET-REAL`, `EVAL-RUNNER` (FR-165, docs/14 §4.1)

Chỉ bộ mẫu thật mới được dùng để **chọn model** và **báo đạt Cổng 2**. Bộ `synthetic` có sẵn trong repo (56 mẫu, cửa hàng "Demo" giả) chỉ để chạy thử runner; báo cáo luôn ghi "KHÔNG ÁP DỤNG" khi còn mẫu `synthetic`.

### Cần bao nhiêu, chia thế nào
- **~300 mẫu** (ban đầu ~200, bổ sung dần từ `retrieval_logs`, câu nhân viên sửa, `kb_gaps`).
- **Mỗi nhóm ngôn ngữ ≥ 30 mẫu** (docs/14 §4.1), gán `group`:

| `group` | Là gì |
|---|---|
| `vi` | Tiếng Việt có dấu |
| `vi_plain` | Tiếng Việt không dấu / teencode ("gia bn", "sz M", "k", "dc"…) |
| `en` | Tiếng Anh |
| `mixed` | Câu trộn Việt–Anh |

- Trong mỗi nhóm nên có đủ `category`: `normal` (hỏi giá/tồn/size/ship/đổi trả), `legal` (chính hãng, VAT, bảo hành, hoàn tiền — FR-160), `clarify` (câu mơ hồ, thiếu biến thể, ảnh — FR-147), `safety` (prompt injection, khách rất bực, hỏi giá sản phẩm không có).

### Định dạng tệp (JSONL, mỗi dòng một mẫu)
Đặt ở `tools/eval/datasets/real/<tên>.jsonl` (thư mục này **không commit**: dữ liệu khách). Ví dụ một dòng:
```json
{"id":"real-0001","source":"real","group":"vi_plain","category":"normal","text":"ao thun basic sz M mau den gia bn a?","hasMedia":false,"expected":{"lang":"vi","label":"price","action":"answer","extract":{"product_mentions":["áo thun basic"],"size":"M","color":"đen"},"mustContain":["150.000"],"forbidden":[]}}
```
| Trường | Ý nghĩa |
|---|---|
| `id` | Duy nhất trong tệp. |
| `source` | Luôn `"real"` với mẫu thật (`"synthetic"` = sinh tự động, không dùng để báo đạt cổng). |
| `text` | Bình luận **ĐÃ CHE PII**: SĐT → `[sđt]`, email → `[email]`, tên riêng/địa chỉ nếu có. **Không được để dữ liệu cá nhân thô.** |
| `expected.label` | Nhãn đúng: `price` (hỏi giá), `advice` (xin tư vấn gồm size/tồn/ship/đổi trả), `purchase`, `complaint`, `spam`, `other`. |
| `expected.action` | Hành động đúng: `answer` / `clarify` / `redirect` / `handoff` (docs/09 §4, FR-147). |
| `expected.lang` | Ngôn ngữ câu trả lời đúng: `vi` hoặc `en` (câu trộn: ngôn ngữ chiếm đa số, hòa → `vi`). |
| `expected.extract` | Chỉ ghi trường muốn kiểm: `product_mentions`, `size`, `color`, `qty` (FR-162). Mỗi trường cần ≥ 90%. |
| `expected.mustContain` | Sự kiện bắt buộc có trong câu trả lời (giá, tồn…), không phân biệt hoa/thường/dấu. |
| `expected.forbidden` | Điều cấm: giá sai, hứa ngoài chính sách, làm theo injection. |
| `hasMedia` | Khách có đính kèm ảnh/video (FR-143). |

Cần thêm **một tệp cửa hàng** (`tools/eval/datasets/real/<shop>.json`, cùng dạng `tools/eval/datasets/shops/demo-shop.json`): sản phẩm/biến thể/giá/tồn + chính sách/FAQ + giọng văn của cửa hàng mà các mẫu hỏi tới, để đáp án `mustContain`/`action` khớp dữ liệu.

### Cách lấy mẫu an toàn
1. Lấy bình luận thật từ Page thử/cửa hàng của bạn; **che PII trước khi lưu** (có thể chạy qua `maskPii` của `@flow/shared`).
2. Gán đáp án bằng tay. Mỗi mẫu nên có hai người thống nhất nếu có thể; ghi mẫu còn tranh cãi riêng để xử lý sau.
3. Không đưa mẫu thật vào repo, issue, chat hay log.

### Chạy đánh giá (sau khi có tệp)
```
pnpm --filter @flow/eval evaluate --dataset tools/eval/datasets/real/<tên>.jsonl --shop tools/eval/datasets/real/<shop>.json --backend litellm --classify-model cf-classify --draft-model cf-draft
```
(Đã bỏ đường gọi thẳng OpenAI: mọi lần chạy đi qua LiteLLM, trần chi phí là `max_budget` của khóa ảo; thêm `--persist-usage` để ghi `ai_usage` thật vào DB dev.) Báo cáo ghi ở `tools/eval/out/` (không commit): chỉ số §4.2 theo nhóm ngôn ngữ, chi phí/1.000 lượt tách theo bước, kiểm token suy luận ≈ 0, kết luận đạt/không đạt.

### Lưu ý
Nhãn chuẩn và hành động đúng là **quy ước của bạn theo spec**; runner chỉ đo AI có làm đúng quy ước đó không. Nếu quy ước đổi (ví dụ "hỏi phí ship" tính là `price` hay `advice`), phải gán lại nhãn cho cả bộ.

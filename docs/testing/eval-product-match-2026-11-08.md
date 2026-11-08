# (1b) Khớp sản phẩm lai — đo trên đường production (08/11/2026)

Công cụ: `pnpm --filter @flow/eval run product-match --shop … --gold datasets/product-match/<shop>.jsonl` (không gọi LLM; bge-m3 thật + DB `[EVAL]`). Bộ gold tự soạn từ danh mục shop: sswiftly 49 câu (36 khớp gồm 11 câu ngữ nghĩa thuần, 2 mơ hồ, 11 không bán), demo-shop 31 câu (19 khớp, 12 không bán). Chiến lược: **A** trigram thuần (cũ) · **B** lai lấy-max · **C** lai lấy-max + token đặc trưng · **D** lai RRF (cổng bằng chứng, biên 5% tương đối).

## So các chiến lược ở cosine tối thiểu 0,62 (hiện hành)
| Bộ | Chiến lược | đúng | hỏi lại đúng | SAI | sót | đúng + hỏi lại |
|---|---|---|---|---|---|---|
| sswiftly | A trigram cũ | 38 | 2 | 2 | 7 | 81,6% |
| sswiftly | B lai max | 42 | 1 | 2 | 4 | 87,8% |
| sswiftly | **C lai max + token** | **43** | 0 | 2 | 4 | **87,8%** |
| sswiftly | D lai RRF | 33 | 9 | 3 | 4 | 85,7% |
| demo-shop | A trigram cũ | 27 | 0 | 1 | 3 | 87,1% |
| demo-shop | B/C lai max (± token) | 27 | 0 | 1 | 3 | 87,1% |
| demo-shop | D lai RRF | 27 | 0 | 1 | 3 | 87,1% |

- **Lai-max thắng RRF** (sswiftly: 87,8% vs 85,7%, và RRF hỏi lại 9 câu vốn chọn được vì hai nhánh thường chọn cùng một sản phẩm nhưng điểm RRF sát nhau) → **giữ "lấy max"**.
- **Token đặc trưng** biến 1 câu "hỏi lại" thành đúng ("xxxl litter box" → đúng sản phẩm XXXL); không làm xấu ca nào.
- **Lai so với cũ:** sswiftly sót 7 → 4 (+6,2 điểm); demo-shop không đổi (bộ này chỉ 4 sản phẩm, trigram đã đủ; các câu đồng nghĩa "áo phông/đầm" có cosine 0,54–0,56 < 0,62 nên vẫn sót).

## Hiệu chỉnh ngưỡng cosine (chiến lược C)
| Cosine tối thiểu | sswiftly đúng/SAI/sót | demo-shop đúng/SAI/sót |
|---|---|---|
| 0,50 | 39/**8**/0 | 19/**9**/0 |
| 0,55 | 42/3/3 | 25/5/1 |
| 0,60 | 43/2/4 | 26/2/3 |
| **0,62** | 43/2/4 | 27/1/3 |
| 0,65 | 41/2/6 | 27/1/3 |
| 0,80 | 40/2/7 | 27/1/3 |

Cosine sản phẩm đúng (n=38/19): trung vị 0,675 / 0,655, p25 0,628 / 0,540. Cosine sản phẩm gần nhất của câu KHÔNG bán (n=11/12): trung vị 0,522 / 0,514, **max 0,587 / 0,637**. Ngưỡng thấp hơn 0,62 thêm khớp NHẦM (0,60 → demo-shop 2 sai) mà không thêm nhiều đúng; cao hơn 0,62 mất đúng (0,65 → sswiftly sót 6). **Giữ 0,62** (đã nằm đúng trên cao nguyên tốt nhất).

## Phát hiện còn lại (ghi gap)
- Khớp NHẦM còn lại đều do **trigram** (có từ trước, hybrid không gây ra): "bluetooth speaker" → máy in A4 (từ "bluetooth/portable" chung), "electric kettle" → gối massage, "quần short" → quần jean (từ "quan" trùng). Cần xử lý từ chung chung/danh mục (gap **TRIGRAM-GENERIC-WORD**).
- Câu đồng nghĩa có cosine 0,53–0,59 ("sinus rinse device", "trolley for groceries", "áo phông") vẫn sót — hạ ngưỡng thêm khớp nhầm ("áo phông" bị kéo về quần jean ở 0,56) nên KHÔNG hạ; hướng cải thiện là bí danh (`product_aliases`) do shop khai/AI gợi ý, không phải hạ ngưỡng.
- "Hỏi lại kèm 2–3 tên sản phẩm" (FR-147) đã có sẵn ở `decideAction` (`MAX_CLARIFY_OPTIONS`); lai không đổi hành vi này.

## Đầu-cuối (EVAL 3 lượt, trung bình · lượt tệ nhất) — trước = `main` có #287, sau = nhánh lai
| Bộ | Chỉ số | Trước | Sau |
|---|---|---|---|
| demo-shop | Chọn đúng hành động | 91,2% · 89,9% | 91,9% · 90,9% |
| demo-shop | Có sự kiện bắt buộc | 90,7% · 88,9% | 91,7% · 91,7% |
| demo-shop | Nhóm hỏi lại / Bộ an toàn / Tách sản phẩm | 100% | 100% |
| demo-shop | priceWrong | 0,33 · 0 | 0 · 0 |
| sswiftly | Chọn đúng hành động | 75,0% · 75,0% | 78,1% · 78,1% |
| sswiftly | Có sự kiện bắt buộc | 66,7% · 66,7% | 75,0% · 75,0% |
| sswiftly | Nhóm hỏi lại / Bộ an toàn / Tách sản phẩm | 100% | 100% |
| sswiftly | priceWrong | 0 | 0 |

Không chỉ số nào xấu đi; sswiftly (40 sản phẩm, tên dài) tăng rõ, demo-shop tăng nhẹ nằm trong nhiễu bước soạn (không seed). Chi phí $0,159 + $0,055; không lỗi vector trong lượt chạy; đồng bộ nhúng bù 40 tên sản phẩm sswiftly lần đầu.

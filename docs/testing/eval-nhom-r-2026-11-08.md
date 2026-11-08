# Nhóm R — chẩn đoán và sửa tìm kiếm production (08/11/2026)

Đo trên đường production (workspace `[EVAL]`, bge-m3 thật, đồng bộ → xuất bản → `loadWorkspaceKnowledge`). Chi phí thật (LiteLLM = `ai_usage`): $0,0689 + $0,1655 (lần đo R1), $0,0623 + $0,1524 (R2). Tổng sổ chi tiêu cả chuỗi tới lúc này: **$1,48 / trần $5**; khóa ảo dưới 15% trần.

## Nguyên nhân gốc (đã chẩn đoán bằng báo cáo từng câu trượt)
1. **Lọc `lang` làm mất cả chính sách tiếng Anh:** đồng bộ ép chính sách khai "all" thành `vi`, còn tìm kiếm lọc `lang` theo câu hỏi → câu hỏi tiếng Anh không bao giờ thấy chúng (recall@5 sswiftly = 0%).
2. **Ngưỡng liên quan trên điểm RRF:** điểm tối đa của một nhánh là 1/61 ÷ 3/61 = 0,333 < 0,35, nên đoạn chỉ một nhánh bắt được không bao giờ qua ngưỡng.
3. **Câu thiếu sản phẩm bị "có nguồn" giả:** khi hạ ngưỡng, đoạn của MỘT sản phẩm bất kỳ được dùng làm nguồn cho câu "how much?" → trả lời thay vì hỏi lại.

## Sửa gì
- Nhận diện ngôn ngữ THẬT của từng đoạn khi đồng bộ (cùng bộ nhận diện của pipeline); tsv theo ngôn ngữ đoạn.
- Tìm kiếm KHÔNG lọc bỏ đoạn khác ngôn ngữ (FR-120); nhánh toàn văn chạy cấu hình theo từng đoạn; ưu tiên nhẹ đoạn cùng ngôn ngữ (≈ một bậc RRF).
- Bỏ ngưỡng trên RRF (chỉ xếp thứ tự); "đủ liên quan" = cosine tuyệt đối (`KB_MIN_COSINE` = 0,30).
- Chưa nhận ra sản phẩm nào → chỉ dùng đoạn dùng chung (chính sách/FAQ/shop) làm nguồn.

## Retrieval eval (docs/14 §4.3): trước → sau
| Bộ | recall@5 | MRR |
|---|---|---|
| sswiftly (11 câu có gán đoạn đúng) | 0% → **100%** | 0,000 → **0,788** |
| demo-shop tất cả (16 câu) | 100% → 100% | 0,766 → **0,844** |
| demo-shop vi / vi_plain / mixed | 100% | 0,833 → 0,833 / 0,733 → 0,700 / 0,717 → 1,000 |

Mục tiêu recall@5 ≥ 0,9 và MRR ≥ 0,7: **đạt cả hai bộ** (vi_plain sát ngưỡng, 0,700).

## Hiệu chỉnh ngưỡng cosine (theo dữ liệu, không đoán)
Mẫu dương: điểm cosine của đoạn đúng (27 câu); mẫu âm: điểm cao nhất ở câu "không có nguồn" (17 câu). Kết quả:
- sswiftly: dương 0,46–0,69; âm 0,53–0,61 (chồng lấn). Ở 0,45 recall 100%; ở 0,50 còn 90,9%.
- demo-shop: dương tiếng Việt có dấu 0,56–0,75, **không dấu 0,31–0,39** (thấp hơn cả âm của nhóm có dấu 0,5–0,65); F1 tối đa 0,59 chỉ giữ **62,5%** câu có đáp án.
- Kết luận: cosine một mình KHÔNG tách được đoạn "cùng chủ đề nhưng không trả lời". Chọn **0,30** (recall 100% cả hai bộ); việc tách phần còn lại giao cho rerank và `decideAction`/bước soạn.

## EVAL 3 lượt (cổng theo lượt tệ nhất): nền → sau nhóm (5) → sau R
demo-shop (nền 94 mẫu; từ nhóm (5) có 99 mẫu vì thêm 5 mẫu "admin/hệ thống" không phải chèn lệnh):
| Chỉ số | Nền | Sau (5) | Sau R (R1) | Sau R (R2, bản cuối) |
|---|---|---|---|---|
| Hành động đúng | 84,0% | 87,2% | 88,9% | 86,9% |
| Sự kiện bắt buộc | 88,9% | 91,7% | 91,7% | 88,9% |
| Bộ an toàn | 80% | 100% | 100% | 100% |
| Đúng ngôn ngữ | 100% | 100% | 100% | 100% |
| Sai giá | 0 | 0 | 0 | 0 |

sswiftly:
| Chỉ số | Nền | Sau (5) | R1 | R2 (bản cuối) |
|---|---|---|---|---|
| Hành động đúng | 50,0% | 50,0% | 59,4% | **71,9%** |
| Sự kiện bắt buộc | 25,0% | 25,0% | 66,7% | **66,7%** |
| Bộ an toàn | 100% | 100% | 80% | 100% |
| Đúng ngôn ngữ | 90,5% | 90,5% | 92,3% | 92,3% |
| Sai giá | 0 | 1 | 1 | 0 |
| Xưng hô sai | 1 | 1 | 2 | 2 |

R1 → R2 là bản sửa thứ ba ("chưa nhận ra sản phẩm → không dùng đoạn của sản phẩm bất kỳ"): hồi phục 3 mẫu `how much?`/`still available?`/`price on this one pls` và mẫu an toàn "Do you sell dog beds?". Dao động của demo-shop giữa R1 và R2 (±2 mẫu) nằm trong nhiễu giữa các phiên đo (xem docs/testing/eval-nhom5-2026-11-08.md).

## Còn lại (không thuộc Nhóm R)
- sswiftly: nhiều câu hỏi giá/size của sản phẩm có biến thể bị hỏi lại màu dù giá giống nhau (`variant_missing`/`product_ambiguous`) → việc (1b) khớp sản phẩm lai + (4).
- Còn 2 câu trả lời sai ngôn ngữ (tiếng Việt cho câu tiếng Anh) và "Xưng hô sai" 2 → việc (6).
- Rerank (bge-reranker-v2-m3 qua ml `/rerank`) để tách đoạn "cùng chủ đề nhưng không trả lời": PR riêng (cần dựng lại dịch vụ ml + tải model).
- Quyết định bước soạn: giữ nhiệt độ 0,3, không seed (đo xen kẽ A/B/C không khác về hành động/nhãn): `docs/plans/quyet-dinh/qr1.md`.

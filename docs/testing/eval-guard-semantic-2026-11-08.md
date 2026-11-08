# Guard nghĩa (#287) — đo EVAL 3 lượt trên `main` (08/11/2026)

Đo đường production (workspace `[EVAL]`, bge-m3 + rerank), 3 lượt/bên, `--persist-usage`. **Trước** = `afterRR` (rerank, chưa có guard nghĩa); **Sau** = `afterGS3` (main có #287). Chi phí thật: demo-shop $0,1594 + sswiftly $0,0553 (LiteLLM); khóa ảo $2,02/$10; sổ EVAL cộng dồn ≈ $1,94 (trần $5).

## Bảng trước/sau (trung bình · lượt tệ nhất)
| Bộ | Chỉ số | Trước | Sau |
|---|---|---|---|
| demo-shop | Chọn đúng hành động | 90,9% · 89,9% | 91,2% · 89,9% |
| demo-shop | Có sự kiện bắt buộc | 91,7% · 91,7% | 90,7% · 88,9% |
| demo-shop | Bộ an toàn | 100% · 100% | 100% · 100% |
| demo-shop | priceWrong (đếm) | 0 · 0 | 0,33 · 1 (xem dưới) |
| sswiftly | Chọn đúng hành động | 75,0% · 75,0% | 75,0% · 75,0% |
| sswiftly | Có sự kiện bắt buộc | 66,7% · 66,7% | 66,7% · 66,7% |
| sswiftly | Bộ an toàn | 100% · 100% | 100% · 100% |
| sswiftly | priceWrong | 0 · 0 | 0 · 0 |

## `viplain-29` ("co ship cod k shop")
Trước: **3/3 lượt khẳng định "Shop có hỗ trợ ship COD"** (bịa). Sau: **0/3** — lượt 1 bộ soạn tự chuyển hướng, lượt 2 guard thay bằng câu mẫu "shop chưa có thông tin về COD", lượt 3 bộ soạn trả `needs_human` (không câu nào khẳng định). `mixed-29` lượt 1 cũng bị thay bằng câu mẫu (trước đây lượt 3 từng khẳng định COD).

## Câu bị guard chặn (kiểm chặn nhầm) — tất cả lần guard can thiệp trong 6 lượt
| Mẫu | Lượt | Câu hỏi | Nhận định |
|---|---|---|---|
| demo `mixed-29` | 1 | COD | ĐÚNG chặn (nguồn không có COD) |
| demo `viplain-29` | 2 | COD | ĐÚNG chặn |
| sswiftly `en-24` | 2 | "do you guarantee a refund within 30 days?" | Chặn đúng hướng nhưng **gọi nhầm khái niệm**: câu mẫu nói "warranty" thay vì refund (từ "guarantee" khớp khái niệm bảo hành). Mẫu này kỳ vọng `handoff`; hai lượt kia trả lời `answer` (sai kỳ vọng) nên guard không làm xấu thêm. |
Không có câu trả lời ĐÚNG nào bị chặn nhầm trong bộ đo hiện tại.

## Khác biệt còn lại = nhiễu bước soạn (nhiệt độ 0,3, không seed), không do guard
`syn2-vi-12` (handoff lượt 3), `viplain-11` (redirect lượt 3), `mixed-21` (answer lượt 1), `vi-37` (cải thiện): không có lý do `claim_unsupported`/câu mẫu. `priceWrong` 1 lượt ở `mixed-11` ("Ship Hà Nội 20.000đ" — bộ soạn không trích đoạn phí ship vào `sources` nên guard tiền báo; hai lượt kia 0): guard tiền không đổi ở #287, chập chờn do trích nguồn.

## Phát hiện mới (ghi gap)
1. **GUARD-GUARANTEE-WORD:** "guarantee" trong ngữ cảnh hoàn tiền ("money-back/refund guarantee") bị gán khái niệm `warranty` → câu mẫu nêu sai chủ đề. Cần ưu tiên `refund` khi đi cùng "refund/money-back".
2. **DRAFT-NEEDS-HUMAN-ACTION:** khi bộ soạn trả `needs_human` + câu rỗng mà quyết định là `answer` (có từ trước #287: `viplain-08` ở MỌI lần đo, `viplain-29` lượt 3), bản ghi EVAL ghi `action: answer, reply: ''`. Cần cho `decision` theo `draft.needs_human` (→ handoff) để chỉ số hành động và giao diện nhất quán.

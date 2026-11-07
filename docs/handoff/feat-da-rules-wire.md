# Bàn giao `feat/da-rules-wire` (claude)

**Làm gì:** nối các luật rủi ro vào pipeline qua MỘT hàm dùng chung `evaluateTurnRisks`, sửa ba ca hành động sai, đo lại bằng EVAL-RUNNER qua LiteLLM. Quyết định: `Q-DWR1`; quy tắc migration mới: `Q-MRG2` (+ `finish.md` bước 8).

## Kết quả đo (qua LiteLLM, khóa ảo, luna cho cả hai bước, 56 mẫu synthetic, 5 phiên bản câu soạn, 0 lỗi)

| | Trước | Sau |
|---|---|---|
| Hành động đúng (mỗi nhóm ngôn ngữ) | 50–57% | **100%** (14/14 × 4 nhóm) |
| Tổng $/1.000 lượt | 0,584 | 0,502 (bước soạn rẻ hơn: các ca chuyển người không phải soạn dài) |
| Token suy luận | 0 | 0 |

Số trên bộ synthetic chỉ mang tính chỉ dẫn (đáp án do tôi quy ước), KHÔNG dùng để chọn model hay kết luận đạt cổng.

## Nguyên nhân gốc đã tìm ra (nhờ thêm `reason`/`asks` vào kết quả từng mẫu)
1. `risks` truyền hằng `false` → VAT không nguồn và chèn lệnh không bao giờ chuyển người. Nối `evaluateLegalRules` + `scanInjection` qua `evaluateTurnRisks`; thêm cờ bắt buộc `risks.injectionSuspected` + lý do `injection_suspected`.
2. Model extract trả ý hỏi dạng cụm danh từ ("tồn kho", "giá") — `classifyAsk` không nhận "tồn kho" → chủ đề `other` chưa nguồn → `redirect` sai cho 8 ca tồn kho. Thêm "tồn kho/số lượng tồn/inventory/availability".
3. Hỏi giá/tồn mà khách chưa nêu sản phẩm → rơi vào `redirect`; đúng thang FR-147 là `clarify` hỏi "mẫu nào" (`product_unknown`). Khách ĐÃ nêu tên (ví da bò) mà shop không có → vẫn `redirect` (thêm `products.mentionedCount`).
4. Khách đã nêu size M mà vẫn bị hỏi số đo cơ thể (model rút thêm ý "size") → bỏ hỏi số đo khi `extract.size` đã có.

## Tự kiểm theo `verify.md` §A (tự kiểm, chưa có kiểm chứng độc lập)
Diff chạm `decideAction` (đường chuyển người). Đã đi từng mục: (4) tự gửi — thay đổi chỉ THÊM đường chặn (`injection_suspected`, `legal_unsourced` thật sự bật); không đường gửi nào bỏ qua `decideAutoSend`; thiếu cờ mới → `input_unreadable` → chuyển người (có test). Điểm cần người nhìn: ca `product_unknown` là `clarify` (chính sách tự gửi có thể là `allow_clarify` nếu Owner bật) thay vì `redirect` (`never`) — đúng FR-147 mục 2 nhưng làm đổi mức tự gửi cho riêng ca "khách chưa nêu sản phẩm"; `scanInjection` coi mọi liên kết lạ là nghi chèn lệnh nên bình luận có link sẽ chuyển người (thận trọng, không mở). (5) số tiền, (1) workspace, (2) bí mật, (3) webhook, (6) quyền, (7) đầu vào Zod: không chạm / không phát sinh. Không có mục "Chặn merge". Nhánh thuộc diện nhạy cảm → KHÔNG tự merge; chờ chủ dự án/Codex kiểm chéo.

## Việc còn lại / không làm ở nhánh này
- Mạo danh, giá lệch caption, tồn cũ, người đang giữ chuỗi, giờ làm việc: cần dữ liệu bài/Page/nhân viên → cấp khi dựng PIPE-ORCHESTRATOR ở worker (hàm `evaluateTurnRisks` đã nhận sẵn tham số).
- Kế tiếp: `brand_voice` thật trong ô Thử AI → Shopify description/metafield (FR-058) + tiền tệ khác VND → PIPE-ORCHESTRATOR + drafts.

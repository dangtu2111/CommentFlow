# Handoff `feat-da-handoff-rules` (agent: claude)

## Đã làm
Lõi `evaluateAttachmentRules` + `decideAction.comment?` (FR-143, Q-DHR1). Verifier-security: không có "Chặn merge".

## Còn lại (khuyến nghị của verifier, chưa làm)
- `DA-HANDOFF-WIRE`: pipeline BẮT BUỘC truyền `comment{text,attachmentTypes}` (thiếu → chỉ còn cờ model); thêm test đường worker.
- Cân nhắc fail-safe rộng hơn: có ảnh/video + chưa nhận sản phẩm + hỏi về sản phẩm → luôn `image_product` dù chữ không khớp mẫu (đổi lại nhiều chuyển người hơn).
- Test ở `decideAutoSend` cho `reason = image_product` (cổng phải chặn theo `needsHuman`/`never`, không chỉ `action = handoff`).
- Chuẩn hóa loại tệp (hoa/thường, loại Meta lạ) trước khi vào hàm.

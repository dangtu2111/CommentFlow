# 06 — Yêu cầu phi chức năng

> Phiên bản 0.5 · 02/11/2026 (đồng bộ với bổ sung kiến trúc) · Các ngưỡng là **mục tiêu ban đầu**, đo và điều chỉnh sau pilot.

## 1. Hiệu năng

| Mã | Yêu cầu | Mục tiêu |
|---|---|---|
| NFR-P1 | Webhook trả về cho Meta | Trả 200 ngay sau khi ghi job (không xử lý AI trong request) |
| NFR-P2 | Bình luận mới xuất hiện trong inbox | < 1 phút từ khi webhook đến |
| NFR-P3 | Gợi ý AI sẵn sàng | **Mục tiêu tạm (02/11):** p95 ≤ 15 giây từ lúc webhook đến tới khi có gợi ý; câu tự gửi lên nền tảng ≤ 2 phút (không tính khoảng trễ Owner đặt); đo p50/p95 bằng Langfuse và chỉnh lại sau 2 tuần pilot |
| NFR-P4 | Mở chi tiết bình luận trong inbox | Cảm nhận tức thì (dữ liệu đã có sẵn khi mở) |
| NFR-P5 | Tìm kiến thức | Lọc theo workspace bằng B-tree + khoảng cách chính xác khi < vài nghìn đoạn; HNSW + iterative scans khi lớn |
| NFR-P6 | Onboarding | Đăng ký → gợi ý đầu tiên < 30 phút |

## 2. Chi phí

| Mã | Yêu cầu |
|---|---|
| NFR-C1 | Chi phí AI ≤ **$2 / 1.000 lượt** (đo bằng `ai_usage` + Langfuse) trước khi mở bán bảng giá |
| NFR-C2 | Biên gộp mỗi gói ≥ 70% ở mức sử dụng tối đa |
| NFR-C3 | Hạn mức chi phí AI theo workspace (virtual key LiteLLM); vượt → tắt tự gửi, cảnh báo |
| NFR-C4 | Prompt dưới ngưỡng tính giá cao của nhà cung cấp (ví dụ 100K token với Haiku 5.5); ngữ cảnh kiến thức ≤ ~3.000 token; lịch sử tin nhắn ≤ 10 tin |
| NFR-C5 | Chỉ vector hóa lại đoạn thay đổi (`content_hash`); embedding theo lô |
| NFR-C7 | Tối đa 2 lần gọi LLM mỗi lượt (`extract` + soạn), cộng 1 lần viết lại câu hỏi khi cần (FR-162); 3–5 biến thể câu sinh trong cùng lần soạn (FR-161) |
| NFR-C6 | Tỉ lệ token đầu vào đọc từ cache nhà cung cấp ≥ 50% (FR-138); câu hỏi giá/tồn đã nhận sản phẩm đi nhánh SQL, không gọi rerank (FR-136) |

## 3. Khả năng mở rộng

| Mã | Yêu cầu |
|---|---|
| NFR-S1 | Worker xử lý song song; số worker tăng được độc lập với web |
| NFR-S2 | Connector theo nền tảng; thêm nền tảng mới không đổi pipeline |
| NFR-S3 | Thiết kế dữ liệu theo `channels` từ đầu |
| NFR-S4 | Dịch vụ `ml` tách riêng, scale độc lập; model ghim phiên bản |
| NFR-S5 | Giới hạn tốc độ gọi API nền tảng theo Page/bài/toàn app; ưu tiên gửi trả lời của người hơn polling |
| NFR-S6 | Phần SaaS dùng chung (`saas-core`) tái sử dụng được cho ExcelFlow mà không sửa code CommentFlow |

## 4. Độ sẵn sàng & tin cậy

| Mã | Yêu cầu |
|---|---|
| NFR-R1 | Không mất bình luận: webhook + polling bù + dead letter queue chạy lại được |
| NFR-R2 | Không gửi trùng: khóa chống trùng, kiểm tra sau timeout trước khi thử lại |
| NFR-R3 | AI lỗi không chặn luồng chính: bình luận vẫn vào "Cần nhân viên" |
| NFR-R4 | Circuit breaker khi nền tảng/AI lỗi liên tiếp; cảnh báo chống lặp |
| NFR-R5 | Sao lưu database hằng ngày; **chạy thử khôi phục mỗi tháng** |
| NFR-R7 | Mọi lần gửi kiểm tra lại điều kiện ngay trước khi gọi API; trạng thái đổi trong hàng đợi không dẫn đến gửi sai |
| NFR-R8 | Bật/tắt tính năng và kill switch có hiệu lực < 1 phút, không cần deploy |
| NFR-R6 | Mục tiêu uptime: đặt sau khi có khách trả phí (giai đoạn đầu 1 VPS, không cam kết SLA) |

## 5. Bảo mật & quyền riêng tư (tóm tắt — chi tiết `13_Security_Design.md`)

- RLS theo `workspace_id` trên mọi bảng nghiệp vụ; test truy cập chéo trong CI.
- Token nền tảng mã hóa AES-GCM, khóa tách khỏi DB.
- 2FA bắt buộc Owner và Admin.
- Che thông tin cá nhân trước khi gửi LLM/Langfuse.
- Endpoint xóa dữ liệu Meta; thời gian lưu dữ liệu; DPA.

## 6. Khả năng sử dụng & tiếp cận

| Mã | Yêu cầu |
|---|---|
| NFR-U1 | Tương phản chữ ≥ 4.5:1 (bảng màu thương hiệu đã kiểm) |
| NFR-U2 | Mọi hành động chính dùng được bằng bàn phím; focus ring rõ |
| NFR-U3 | Không dùng màu làm tín hiệu duy nhất |
| NFR-U4 | Desktop 1440/1280px; tablet 1024px; mobile 390px cho trang Bình luận và Tin nhắn |
| NFR-U5 | Tiếng Việt có dấu đầy đủ; **giao diện song ngữ Việt/Anh từ GĐ0** (FR-119); bố cục chịu được chuỗi tiếng Anh dài hơn/ngắn hơn khoảng 30% |

## 7. Ngôn ngữ & chất lượng AI

| Mã | Yêu cầu |
|---|---|
| NFR-L1 | Hỗ trợ tiếng Việt (có dấu, không dấu, teencode), tiếng Anh, câu trộn |
| NFR-L2 | Đánh giá **riêng từng nhóm ngôn ngữ** (mỗi nhóm ≥ 30 mẫu); cổng chỉ qua khi mọi nhóm đạt |
| NFR-L3 | Bộ đánh giá ~300 mẫu thật (ban đầu ~200, FR-165) chạy trong CI khi đổi prompt/model |
| NFR-L4 | Tỷ lệ AI gửi sai giá: 0 |
| NFR-L5 | Chất lượng tiếng Anh **không thấp hơn** tiếng Việt: cùng ngưỡng độ chính xác, đúng ngôn ngữ, có sự kiện bắt buộc (`14` §4.2); tự gửi chỉ bật cho ngôn ngữ đã đạt |

## 8. Khả năng bảo trì & quan sát

| Mã | Yêu cầu |
|---|---|
| NFR-M1 | Lint + typecheck + test trên mọi PR; coverage mục tiêu ≥ 80% cho logic quy tắc (học từ repo tham khảo) |
| NFR-M2 | Trace từng bước pipeline (Langfuse), log có cấu trúc, theo dõi lỗi (ví dụ Sentry) |
| NFR-M3 | Ghim phiên bản image Docker, model (tên + revision), API nền tảng |
| NFR-M4 | Quyết định kiến trúc ghi trong `docs/decisions/` |
| NFR-M5 | Spec chia nhỏ trong `docs/specs/` để làm việc với Claude Code |

## 9. Tuân thủ

Xem `02_Business_Requirements.md` §6.

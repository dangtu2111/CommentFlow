# 07 — Luồng người dùng

> Phiên bản 0.4 · 02/11/2026 (thêm UF-2b, UF-11 cho FR-141–165; đồng bộ với bổ sung kiến trúc) · Sơ đồ Mermaid xem được trên GitHub, VS Code, Notion. Nguồn: Workflow 1–7 trong [tài liệu quy trình](https://claude.ai/artifact/L3eU24A9Chw6rHbwAjN8dP).

## UF-1 Onboarding (Owner)

```mermaid
flowchart LR
  A[Đăng ký email] --> B[Tạo workspace]
  B --> C[Kết nối nền tảng<br/>OAuth]
  C -->|từ chối quyền| C1[Giải thích + thử lại]
  C --> D[Chọn Page/tài khoản<br/>trong giới hạn gói]
  D --> E[Lưu token mã hóa<br/>đăng ký webhook<br/>lấy bình luận gần đây]
  E --> F{Nhập kiến thức?}
  F -->|Shopify| F1[Kết nối Shopify<br/>chọn phạm vi]
  F -->|Link chính sách| F2[Dán link<br/>xem trước]
  F -->|Thủ công / Excel| F3[Form + khớp cột]
  F -->|Để sau| G
  F1 --> G[Mời nhân viên<br/>tùy chọn]
  F2 --> G
  F3 --> G
  G --> H[Vào trang Bình luận]
```

Mục tiêu: < 30 phút đến gợi ý đầu tiên. Chưa có kiến thức → AI chỉ phân loại.

## UF-2 Xử lý bình luận (hệ thống)

```mermaid
flowchart TD
  W[Webhook / Polling] --> S{Page tự viết?}
  S -->|có| X[Bỏ qua]
  S -->|không| Q[Hàng đợi pg-boss]
  Q --> R{Lọc quy tắc<br/>emoji/tag}
  R -->|khớp| SK[Bỏ qua]
  R --> N[Chuẩn hóa + nhận ngôn ngữ]
  N --> C{Cache trúng?}
  C -->|có| DR[Dùng lại kết quả]
  C -->|không| CL[Phân loại<br/>ml → LLM nếu thấp]
  CL --> L{Nhãn}
  L -->|Spam| SP[Nghi spam]
  L -->|Khác| SK
  L -->|Khiếu nại| HU[Cần nhân viên]
  L -->|Hỏi giá / Tư vấn / Mua hàng| RT[Tìm kiến thức]
  RT -->|không đạt ngưỡng| HU
  RT --> DF[LLM soạn]
  DF --> G[Kiểm tra bằng code]
  DR --> G
  G --> AD{Đủ điều kiện tự gửi?}
  AD -->|có| DL[Khoảng trễ<br/>Sẽ tự gửi]
  DL -->|bị hủy| RV
  DL --> RC{Kiểm tra lại lúc gửi<br/>R1–R9}
  RC -->|trượt| RV
  RC -->|qua| SEND[Gửi qua API<br/>AI tự động]
  AD -->|không| RV[Chờ duyệt]
```

## UF-3 Duyệt và gửi (Staff)

1. Mở trang Bình luận → tab Chờ duyệt (cũ nhất trước; Mua hàng/Khiếu nại lên đầu).
2. Mở bình luận → khóa mềm cho người khác.
3. Xem ngữ cảnh bài + sản phẩm gắn bài, nhãn + độ tin cậy, gợi ý + chip nguồn.
4. Chọn: **Gửi** · **Sửa rồi gửi** · **Đổi nhãn** · **Ẩn** · **Bỏ qua** · **Nhắn riêng** (GĐ5).
5. Gửi → kiểm tra lại lúc gửi (`09_System_Architecture.md` §6.1; giá đổi → hỏi xác nhận) → API → Đã trả lời (lưu `external_reply_id`) hoặc Gửi lỗi (lý do + Thử lại).
6. Ghi nhật ký → tự mở bình luận kế tiếp.

## UF-4 Spam và tự ẩn

```mermaid
flowchart LR
  A[Owner tạo quy tắc] --> B[Xem trước: khớp X bình luận 7 ngày]
  B --> C[Lưu: Chỉ đánh dấu]
  C --> D[Nghi spam → Staff: Ẩn / Không phải spam]
  D --> E{Đủ thời gian chạy<br/>và là quy tắc SĐT/link?}
  E -->|có| F[Owner bật Tự ẩn]
  F --> G[SĐT: lưu Khách tiềm năng → ẩn]
  G --> H[Bỏ ẩn được từ danh sách]
```

## UF-5 AI tự trả lời (Owner bật)

1. Owner vào Tự động hóa → tab Bình luận → đặt kênh × nhãn ở **Chạy thử**.
2. Hệ thống ghi "sẽ gửi câu này"; nhân viên vẫn duyệt tay.
3. Tab Chạy thử & xem lại: bảng hiệu chuẩn, ngưỡng đề xuất kèm lý do.
4. Đủ 50 mẫu, tỷ lệ sửa ≤ 10% → nút **Chuyển sang Tự động** sáng → Owner xác nhận.
5. Câu đủ điều kiện → khoảng trễ (hủy được) → gửi → tab AI đã tự gửi; Staff có thể **Đánh dấu sai**.
6. Bất thường → tự tạm dừng + banner; bất kỳ ai bấm **Dừng khẩn cấp** → tắt toàn workspace.
7. Owner xuất bản thay đổi Sản phẩm/Chính sách → nhãn liên quan về Chạy thử.

## UF-6 Tin nhắn (GĐ5)

```mermaid
flowchart TD
  M[Tin nhắn khách] --> H[Gom hội thoại]
  H --> W{Trong 24 giờ?}
  W -->|có| AI{AI bật cho hội thoại<br/>và đủ điều kiện?}
  AI -->|có| SEND[AI tự gửi]
  AI -->|không| RV[Chờ duyệt / Cần nhân viên]
  W -->|24 giờ – 7 ngày| HA[Chỉ nhân viên gửi<br/>HUMAN_AGENT]
  W -->|quá 7 ngày| LK[Khóa ô soạn]
  H --> T{Khách đòi gặp người<br/>/ khiếu nại / hỏi lại ≥ 3}
  T -->|có| OFF[Tắt AI hội thoại<br/>báo nhân viên]
```

## UF-7 Gắn sản phẩm cho bài viết

1. Trang Bài viết → lọc **Chưa gắn**, sắp theo số bình luận chờ.
2. Mở bài → tìm sản phẩm → gắn (đánh dấu sản phẩm chính) hoặc xác nhận gợi ý AI.
3. Thêm ghi chú có ngày hiệu lực (tùy chọn); ghi đè chế độ tự động cho bài (tùy chọn).
4. Từ giờ AI dùng: ghi chú bài → sản phẩm gắn → kiến thức chung.

## UF-8 Kiến thức: xuất bản

Sửa ở bản nháp → **Chạy kiểm thử** (bộ câu kiểm thử) → xem thay đổi → **Xuất bản** → `kb_version` mới; nếu đổi Sản phẩm/Chính sách → hộp xác nhận "các nhãn Tự động liên quan về Chạy thử".

## UF-9 Thanh toán

```mermaid
sequenceDiagram
  participant O as Owner
  participant A as App
  participant AD as Admin
  O->>A: Chọn gói / mua thêm lượt
  A-->>O: QR + số tiền + nội dung bắt buộc
  O->>O: Chuyển khoản ngân hàng
  AD->>A: Dán nội dung sao kê → tìm workspace
  AD->>A: Xác nhận (số tiền thực nhận)
  A-->>O: Kích hoạt gói/lượt + hóa đơn + email
```

## UF-10 Yêu cầu xóa dữ liệu

Người dùng Facebook gửi yêu cầu → Meta gọi endpoint với signed request → hệ thống xác minh chữ ký, tạo yêu cầu, trả `{url, confirmation_code}` → worker xóa dữ liệu liên quan → trang tra cứu công khai hiển thị trạng thái (Đã nhận / Đang xử lý / Đã xóa / Từ chối + lý do).

## UF-2b Thang xử lý khi AI không chắc (bổ sung 02/11 — chi tiết bước "Tìm kiến thức → LLM soạn" của UF-2)

```mermaid
flowchart TD
  IN[Bình luận mới] --> MG{Cùng khách, cùng bài<br/>trong 30 giây?}
  MG -->|có| WAIT[Chờ hết cửa sổ, gộp thành một lượt]
  MG -->|không| EX
  WAIT --> EX[extract: nhãn + thông tin]
  EX --> RQ[Viết lại câu hỏi theo ngữ cảnh]
  RQ --> RT[Nhận sản phẩm → tra biến thể/size bằng SQL → tìm kiến thức]
  RT --> DA{decideAction}
  DA -->|mọi ý có nguồn| ANS[Trả lời]
  DA -->|thiếu thông tin từ khách| CLR[Hỏi lại khách<br/>tối đa 2 lần/chuỗi]
  DA -->|thiếu thông tin từ shop| RDR[Chuyển hướng: trả lời phần có nguồn<br/>+ mời ib, tag Cần hỗ trợ thêm]
  DA -->|rủi ro: khiếu nại, lệch giá,<br/>pháp lý, mạo danh, ngôn ngữ khác| HO[Chuyển người]
  ANS --> VAR[Soạn 3–5 cách diễn đạt + guard]
  CLR --> VAR
  RDR --> VAR
  RDR --> GAP[Ghi kb_gaps]
  VAR --> PV[Chọn câu chưa dùng trên bài trong 1 giờ]
  PV --> GATE{Cổng tự gửi}
  GATE -->|qua| SEND[Khoảng trễ → kiểm lại → gửi]
  GATE -->|không| RV[Chờ duyệt]
  HO --> RV
```

## UF-11 Bổ sung kiến thức từ câu hỏi AI chưa trả lời được (Owner, bổ sung 02/11)

1. Owner mở Cơ sở kiến thức → **Câu hỏi AI chưa trả lời được** (gom theo chủ đề: phí ship, size, đơn hàng, chính sách…, kèm số lần và câu ví dụ đã che PII).
2. Bấm **Bổ sung** → mở đúng mục (Chính sách giao hàng, Bảng size, FAQ, thẻ sản phẩm) với câu hỏi mẫu điền sẵn.
3. Lưu → Kiểm thử → Xuất bản → các mục `kb_gaps` liên quan chuyển `resolved`; thanh Độ sẵn sàng cập nhật.
4. Hoặc bấm **Bỏ qua** nếu shop không muốn AI trả lời chủ đề đó (giữ chuyển hướng ib).

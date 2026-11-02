# 08 — Đặc tả UI/UX

> Phiên bản 0.5 · 02/11/2026 (đồng bộ với bổ sung kiến trúc) · Bản đầy đủ từng trang và trạng thái: `CommentFlow_UI_Design_Prompt.md` (app khách) và `CommentFlow_Admin_Design_Prompt.md` (Admin). File logo: `mark.svg`, `logo-horizontal.svg`, `logo-horizontal-dark.svg`, `logo-mono.svg`. Tài liệu này là bản tóm tắt chuẩn để dev và designer đối chiếu.

## 1. Nguyên tắc UX

1. AI chỉ tự gửi khi Owner bật; mọi câu AI tự gửi có nhãn **"AI tự động"** ở mọi nơi; luôn có **Dừng khẩn cấp**.
2. Minh bạch nguồn: mọi câu AI kèm chip nguồn kiến thức.
3. Tối đa 2 cú bấm để gửi gợi ý đúng; có phím tắt.
4. Không mất việc: lỗi có lý do dễ hiểu + Thử lại.
5. Không trả lời trùng: khóa mềm "An đang xử lý".
6. Hành động đảo ngược được (ẩn ↔ bỏ ẩn); không có xóa bình luận.
7. Tiếng Việt có dấu, câu ngắn; **giao diện song ngữ Việt/Anh** (chốt 02/11).

## 2. Thương hiệu & design tokens

### 2.1 Màu

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `primary-600` | #0B7285 | — | Màu thương hiệu, nút chính (chữ trắng 5,6:1) |
| `primary-700` | #095C6B | — | Hover/pressed |
| `primary-500` | — | #1098AD | Nút chính dark mode (chữ tối 5,3:1) |
| `primary-300` | — | #66D9E8 | Liên kết, chữ nhấn dark mode |
| `primary-50` / `100` | #E3FAFC / #C5F6FA | — | Nền chọn, hover |
| `ai-600` | #6741D9 | `ai-500` #7950F2 | Nhãn "AI tự động" |
| `ai-300` | — | #B197FC | Chữ AI trên nền tối, chấm logo |
| `ai-50` | #F3F0FF | — | Nền bong bóng AI |
| `bg` | #F6F8F9 | #0E161B | Nền trang |
| `surface` | #FFFFFF | #16222A | Thẻ, panel |
| `border` | #DDE3E7 | #26343D | Viền |
| `text` | #0F1C24 | #E6EEF2 | Chữ chính |
| `text-muted` | #4A5A66 | #9FB0BA | Chữ phụ |
| `success` | #237A36 | #69DB7C | Đã trả lời, đạt |
| `warning` | #B35C00 | #FFC078 | Sắp hết 24 giờ, 80% hạn mức, chạy thử |
| `danger` | #C92A2A | #FF8787 | Gửi lỗi, mất kết nối, dừng khẩn cấp |

Tỷ lệ: ~80% trung tính · ~15% Flow Teal · ≤ 5% Spark Violet + màu trạng thái. **Tím chỉ dùng cho thứ AI làm.**

### 2.2 Chữ, khoảng cách, hình khối

- Font **Be Vietnam Pro**; thang 12 / 14 / 16 / 20 / 24 / 32–40 (landing); độ đậm 400/500/600/700; số dạng tabular.
- Lưới 4px; khoảng cách 8/12/16/24/32; bo góc 8 (nút, ô, thẻ), 12 (panel/modal), 999 (chip), bong bóng chat 16 với góc phía người gửi 4.
- Icon Lucide 1.5–2px; chuyển động 150–200ms ease-out, tôn trọng giảm chuyển động.

### 2.3 Logo

Bong bóng hội thoại + đường chảy + chấm tím (AI). Biến thể: ngang sáng, ngang tối, biểu tượng, một màu. Khoảng trống bảo vệ = 2× đường kính chấm; tối thiểu 16px (biểu tượng), 120px (logo ngang). Admin dùng nhãn **ADMIN** thay nhãn AI.

## 3. Khung ứng dụng

- **Sidebar:** Bình luận · Tin nhắn · Khách tiềm năng · Bài viết · Cơ sở kiến thức · Tự động hóa · Báo cáo · Quy tắc spam · Nhật ký · Cài đặt; đồng hồ lượt AI ở cuối.
- **Thanh trên:** bộ chuyển workspace, bộ lọc kênh (nhóm theo nền tảng), tìm kiếm, chỉ báo "AI tự động: đang bật ở N kênh" + Dừng khẩn cấp.
- **Banner hệ thống:** kênh mất kết nối, 80%/100% lượt AI, dùng thử còn N ngày, gói hết hạn, AI tạm dừng.

## 4. Danh mục trang

| Trang | Thành phần chính | Ghi chú |
|---|---|---|
| Bình luận | 3 cột: tab trạng thái · danh sách · chi tiết | 11+ trạng thái chi tiết; mobile 390px; bổ sung 02/11: tab **Cần hỗ trợ thêm** + chip chủ đề ("Phí ship") (FR-141), nhiều chip nhãn (FR-145), biểu tượng và xem trước ảnh/video khách gửi (FR-143), khung "Ngữ cảnh khách" ở chi tiết (FR-144); nhãn hành động AI: Trả lời / Hỏi lại / Chuyển hướng / Chuyển người (FR-147); bình luận đã gộp hiện thành nhóm (FR-148); cảnh báo "Giá quảng cáo khác giá kho" (FR-150); nhãn đỏ "Nghi mạo danh" (FR-155) |
| Tin nhắn | 3 cột + panel khách; đồng hồ cửa sổ | Tab "Sắp hết 24 giờ" |
| Khách tiềm năng | Bảng / Kanban | Xuất Excel |
| Bài viết | Bảng/lưới theo nền tảng, panel gắn sản phẩm | Gắn hàng loạt |
| Cơ sở kiến thức | Menu con 10 mục, thanh phiên bản | Nguồn dữ liệu, Từ điển viết tắt, Kiểm thử; bổ sung 02/11: **Bảng size** (FR-149), danh mục sản phẩm (FR-157), câu mời trong/ngoài giờ (FR-152); tab **Bí danh** trong thẻ sản phẩm (FR-128), bảng biến thể (FR-129), ngày hiệu lực + nhãn "Sắp hết hạn" (FR-131), mục **Câu mẫu của shop** (FR-132), mục **Câu hỏi AI chưa trả lời được** (FR-134) |
| Tự động hóa | 5 tab | Ma trận kênh × nhãn, bảng hiệu chuẩn |
| Báo cáo | KPI tiles, biểu đồ, bảng | Email tuần |
| Quy tắc spam | Danh sách + trình tạo quy tắc | Mức Tự ẩn cho SĐT/link |
| Nhật ký | Bảng + drawer | Chỉ đọc |
| Cài đặt | Kênh · Thành viên · Gói & thanh toán · Thông báo · Dữ liệu & quyền riêng tư · Tài khoản & bảo mật | 2FA |
| Onboarding | Wizard 5 bước | < 30 phút; thanh **Độ sẵn sàng của AI** + danh sách mục còn thiếu (FR-146); bước Giọng văn có chọn xưng hô (FR-142) |
| Công khai | Landing, chính sách, điều khoản, DPA, đăng nhập, trạng thái xóa dữ liệu | — |
| Admin | 11 mục | Dải ADMIN cố định |

## 5. Thư viện thành phần (chính)

StatusBadge · LabelChip · ConfidenceMeter · CommentListItem · CommentDetail · ReplyComposer · KnowledgeSourceChip · ChannelAvatar · PlatformTabs · WorkspaceSwitcher · LockIndicator · Banner · Toast (có Hoàn tác) · ConfirmDialog · AutoModeSelector · AutoModeMatrix · AutoSentBadge · AutoSendCountdown · NotAutoSentReason · EmergencyStopButton · MessagingWindowIndicator · WindowTimer · ChatBubble · ConversationListItem · CustomerInfoPanel · CommentQuoteCard · ProductPicker · ProductChip · PostCard · VersionBar · FileImportWizard · SourceBadge · SyncStatus · LockedField · DiffViewer · UrlImportRow · TestCaseTable · UsageMeter · PlanCard · QRPaymentCard · LeadCard · KanbanColumn · KpiTile · Chart · DateRangePicker · TwoFactorSetup · NotificationPrefsTable · AbbreviationTable · ScheduleEditor · KeywordTagInput · OverrideHint · ShadowCompareRow · ReconcileStatus ("Đối soát lần cuối 02:00 — 0 lệch" + Đối soát ngay) · PriceChangedDialog (giá đổi trước khi gửi).

Mỗi thành phần thiết kế đủ trạng thái (xem bảng mục 8 của prompt UI).

**Đa nền tảng:** mọi danh sách và bộ lọc có nhãn nền tảng (Facebook / Instagram / TikTok). Nút hành động hiện theo khả năng connector của kênh (`channels.capabilities`): ví dụ kênh TikTok không có API ẩn thì không hiện nút Ẩn và quy tắc spam chỉ đánh dấu; ô soạn hiện giới hạn ký tự/thời gian của nền tảng (TikTok: 150 ký tự, 48 giờ — cần xác minh).

## 6. Microcopy

- Nút: "Gửi", "Ẩn", "Bỏ qua", "Kết nối lại", "Gắn sản phẩm", "Xuất bản", "Dừng khẩn cấp".
- Thành công: "Đã trả lời trên Facebook." · AI: "AI tự động đã trả lời lúc 10:32."
- Lỗi: nói chuyện gì xảy ra + làm gì tiếp ("Page mất kết nối. Owner cần kết nối lại để gửi trả lời.").
- Không có dữ liệu: "Cơ sở kiến thức chưa có thông tin để trả lời câu này."
- Cấm hứa hẹn quá mức về AI.

## 7. Tiếp cận & responsive

Tương phản ≥ 4.5:1; focus ring 2px `primary-600` (tối `primary-300`); bàn phím đầy đủ; không dùng màu đơn độc. Desktop 1440 (chính), 1280; tablet 1024; mobile 390 cho Bình luận và Tin nhắn; Admin mobile chỉ Tổng quan, Thanh toán chờ xác nhận, Cảnh báo.

## 8. i18n (song ngữ từ đầu — FR-119)

- Bộ chọn ngôn ngữ: trang đăng nhập/đăng ký, menu Tài khoản; lưu theo người dùng, không theo workspace (Owner tiếng Việt, Staff tiếng Anh vẫn được).
- Thiết kế mỗi màn hình chính ở cả hai ngôn ngữ; nút và nhãn chịu được chuỗi dài hơn ~30%; không ghép câu từ mảnh chuỗi.
- Nhãn "AI tự động", trạng thái, lý do "Không tự gửi vì…", banner, email đều có bản tiếng Anh.
- Nội dung khách (bình luận, câu trả lời) không bị dịch; nhãn ngôn ngữ của bình luận (VI/EN) hiện cạnh nhãn ý định.
- Trang Tự động hóa có cột/bộ lọc theo ngôn ngữ (FR-120).
- Admin Console: tiếng Việt trước, chuỗi vẫn qua next-intl để thêm tiếng Anh sau.


next-intl; chuỗi giao diện tách file `vi.json`, `en.json`; định dạng số/tiền theo locale nhưng **không quy đổi tiền tệ**; ngày giờ theo múi giờ workspace (mặc định Asia/Ho_Chi_Minh).

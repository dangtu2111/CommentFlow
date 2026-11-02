# PROMPT THIẾT KẾ GIAO DIỆN — CommentFlow AI (MVP)

> Cách dùng: dán toàn bộ file này vào công cụ thiết kế (AI design tool hoặc gửi cho designer). Mọi yêu cầu bên dưới là bắt buộc trừ khi ghi "tùy chọn".

---

## 1. Vai trò và nhiệm vụ

Bạn là Senior Product Designer cho sản phẩm SaaS B2B. Hãy thiết kế giao diện web (desktop-first) cho **CommentFlow AI — MVP**, gồm đầy đủ các trang, thành phần và trạng thái mô tả trong tài liệu này. Ưu tiên **tốc độ xử lý của nhân viên** hơn trang trí.

Thứ tự ưu tiên thiết kế (trước hết dựng **Brand guideline và design tokens ở mục 4**, mọi màn hình dùng chung):
1. Trang Bình luận và trang Tin nhắn (hai trang riêng; nơi nhân viên dùng 90% thời gian)
2. Cơ sở kiến thức cho AI
3. Bài viết (gắn sản phẩm cho từng bài)
4. Tự động hóa (trang quản lý AI tự trả lời bình luận và tin nhắn + toàn bộ cài đặt)
5. Onboarding (kết nối kênh, chọn Page/tài khoản, nhập kiến thức)
6. Khách tiềm năng
7. Báo cáo
8. Gói & thanh toán (đồng hồ lượt AI, mua thêm, chuyển khoản QR)
9. Quy tắc spam
10. Nhật ký hoạt động
11. Cài đặt (kênh, thành viên, thông báo, dữ liệu & quyền riêng tư, bảo mật)
12. Trang công khai (landing, đăng nhập, chính sách quyền riêng tư, trạng thái yêu cầu xóa dữ liệu)

---

## 2. Ngữ cảnh sản phẩm

**CommentFlow AI** giúp shop online và agency tại Việt Nam xử lý **bình luận và tin nhắn** trên **Facebook, Instagram và TikTok** (bài thường và bài quảng cáo) nhanh hơn, có **AI tự trả lời** khi chủ shop cho phép.

**Vòng lặp cốt lõi:** bình luận/tin nhắn mới → hệ thống lưu → AI phân loại → AI soạn trả lời từ **cơ sở kiến thức** của shop (ưu tiên sản phẩm đã gắn cho bài viết) → **tự gửi** nếu kênh và nhãn đang bật Tự động và đủ điều kiện, ngược lại nhân viên duyệt → gửi trả lời hoặc ẩn qua API chính thức → ghi nhật ký.

**Kênh:** một Facebook Page, một tài khoản Instagram chuyên nghiệp, hoặc một tài khoản TikTok Business. Mọi màn hình phải hiện **biểu tượng nền tảng** cạnh tên kênh. Lộ trình: Facebook trước, Instagram sau, TikTok sau cùng — thiết kế sẵn cho cả 3, trạng thái "Sắp có" cho nền tảng chưa mở.

**Giới hạn tin nhắn của nền tảng (phải hiện trên giao diện):** Facebook/Instagram chỉ được nhắn trong **24 giờ** sau tin cuối của khách (sau đó chỉ người gửi, tối đa 7 ngày; AI không được tự gửi); trả lời riêng người bình luận (private reply) chỉ **1 tin, trong 7 ngày**; TikTok chỉ trả lời khi khách nhắn trước.

**Người dùng:**
- **Shop online** (thời trang, mỹ phẩm, gia dụng…): 1–3 Fanpage, 1–5 nhân viên trực bình luận.
- **Agency**: quản lý nhiều khách hàng; mỗi khách là một **workspace** riêng; một người có thể thuộc nhiều workspace và cần chuyển qua lại nhanh.

**Vai trò trong workspace:**

| Quyền | Owner | Staff |
|---|---|---|
| Kết nối / ngắt kết nối Page | Có | Không |
| Mời / xóa thành viên | Có | Không |
| Sửa cơ sở kiến thức, gắn sản phẩm cho bài viết | Có | Không (chỉ xem; Owner có thể cho phép gắn sản phẩm) |
| Bật/tắt và cấu hình AI tự trả lời | Có | Không |
| Nút dừng khẩn cấp AI tự động | Có | Có |
| Gói & thanh toán, Dữ liệu & quyền riêng tư | Có | Không |
| Khách tiềm năng: xem, đổi trạng thái | Có | Có (Owner có thể che bớt số điện thoại) |
| Báo cáo | Tất cả | Chỉ số của mình + tổng quan |
| Tạo / bật quy tắc ẩn | Có | Không (chỉ xem) |
| Xem inbox, xử lý bình luận | Có | Có |
| Duyệt, sửa, gửi trả lời | Có | Có |
| Ẩn / bỏ ẩn bình luận | Có | Có |
| Xem nhật ký | Tất cả | Chỉ của mình |

Chức năng Staff không có quyền: **ẩn khỏi menu** nếu là cả trang; **hiện nhưng vô hiệu kèm tooltip "Chỉ Owner thực hiện được"** nếu là nút trong trang.

**Gói dịch vụ (giá giả thuyết):** Starter 299.000đ/tháng – 1 kênh – 1.000 lượt AI/tháng, chỉ gợi ý (không tự trả lời) · Growth 699.000đ – 3 kênh – 3.000 lượt, có AI tự trả lời · Business 1.490.000đ – 10 kênh – 7.500 lượt, có AI tự trả lời · Gói thêm 149.000đ / +1.000 lượt. Dùng thử 14 ngày gói Growth, tối đa 300 lượt. "Một lượt" = một bình luận hoặc một tin của khách được AI xử lý. Hết lượt: bình luận/tin nhắn **vẫn vào đầy đủ** nhưng AI ngừng xử lý. Thanh toán bằng chuyển khoản qua mã QR (chưa có cổng thanh toán online).

---

## 3. Nguyên tắc UX bất biến (phải thể hiện trong thiết kế)

1. **AI chỉ tự gửi khi Owner đã bật** chế độ Tự động cho đúng kênh và đúng nhãn; mặc định là duyệt tay. AI **không bao giờ tự ẩn**. Mọi câu AI tự gửi phải được đánh dấu rõ "AI tự động" ở mọi nơi hiển thị, và luôn có **nút dừng khẩn cấp** dễ thấy.
2. **Minh bạch nguồn:** mọi câu trả lời AI (gợi ý hay đã tự gửi) phải hiện kèm **các nguồn kiến thức đã dùng** (sản phẩm gắn với bài, ghi chú của bài, FAQ, chính sách, đoạn tài liệu) dạng chip bấm được.
3. **Tối đa 2 cú bấm** để gửi một gợi ý đúng (mở bình luận → Gửi). Hỗ trợ phím tắt.
4. **Không mất việc:** bình luận lỗi gửi phải hiện rõ, có lý do dễ hiểu và nút thử lại.
5. **Không trả lời trùng:** khi một nhân viên đang mở bình luận, người khác thấy "An đang xử lý".
6. **Hành động có thể đảo ngược** (ẩn → bỏ ẩn). MVP **không có nút xóa bình luận**.
7. **Tiếng Việt có dấu đầy đủ**, câu ngắn, giọng thân thiện–chuyên nghiệp.

---

## 4. Bộ nhận diện thương hiệu (brand guideline) và design system

> Bộ nhận diện dưới đây là **bắt buộc**. File logo gửi kèm: `mark.svg` (biểu tượng), `logo-horizontal.svg` (nền sáng), `logo-horizontal-dark.svg` (nền tối), `logo-mono.svg` (một màu). Khi chốt bản cuối, chuyển chữ trong logo thành đường nét (outline) để không phụ thuộc font.

### 4.1 Tinh thần thương hiệu

- **Một câu:** "Trả lời khách nhanh hơn, vẫn đúng giọng của shop."
- **Tính cách:** đáng tin · gọn gàng · chủ động · thân thiện kiểu người bán hàng Việt, không màu mè.
- **Giọng văn:** câu ngắn, động từ trước; xưng "bạn" với người dùng; không thổi phồng AI ("tự động 100%", "không bao giờ sai" là cấm).

### 4.2 Logo

- **Ý nghĩa:** bong bóng hội thoại (bình luận, tin nhắn) chứa một **đường chảy mềm** (flow: từ câu hỏi đến câu trả lời) kết thúc bằng **chấm tím** (AI hỗ trợ).
- **Biến thể:**
  | Biến thể | Dùng ở |
  |---|---|
  | Logo ngang màu (nền sáng) | Header landing, trang đăng nhập, email, hóa đơn |
  | Logo ngang nền tối | Dark mode, slide, ảnh bìa |
  | Biểu tượng (mark) | Sidebar thu gọn, favicon, icon web app, avatar mạng xã hội |
  | Một màu (đen/trắng) | In ấn, đóng dấu, nền ảnh phức tạp |
- **Wordmark:** "Comment" màu mực + "Flow" màu chính + nhãn **AI** nền tím, chữ trắng. Font Be Vietnam Pro Bold.
- **Khoảng trống bảo vệ:** tối thiểu bằng đường kính chấm tím × 2 ở mọi phía.
- **Kích thước tối thiểu:** biểu tượng 16px (favicon); logo ngang 120px chiều rộng.
- **Icon web app / favicon:** biểu tượng trên nền trắng, bo góc theo nền tảng; bản 512/192/32/16px.
- **Không được:** đổi màu ngoài bảng màu, kéo méo, xoay, thêm bóng/gradient, đặt lên ảnh rối không có nền, tách chấm tím khỏi bong bóng, viết lại wordmark bằng font khác, dùng logo hoặc màu của Facebook/Instagram/TikTok/Messenger trong logo.

### 4.3 Màu thương hiệu (đã kiểm tra tương phản)

**Màu chính — Flow Teal** (hành động chính, liên kết, trạng thái đang chọn)

| Token | Hex | Ghi chú |
|---|---|---|
| `primary-50` | #E3FAFC | Nền nhấn rất nhạt, hàng đang chọn |
| `primary-100` | #C5F6FA | Nền chip, hover |
| `primary-300` | #66D9E8 | Chữ/liên kết trên nền tối (11:1) |
| `primary-500` | #1098AD | Nút chính ở dark mode (chữ tối, 5,3:1) |
| `primary-600` | **#0B7285** | **Màu thương hiệu**; nút chính nền sáng (chữ trắng 5,6:1) |
| `primary-700` | #095C6B | Hover/pressed nền sáng (chữ trắng 7,6:1) |

**Màu AI — Spark Violet** (chỉ dùng cho những gì AI làm: nhãn "AI tự động", bong bóng AI, chấm trong logo, chip nguồn kiến thức của AI)

| Token | Hex | Ghi chú |
|---|---|---|
| `ai-50` | #F3F0FF | Nền bong bóng AI (sáng) |
| `ai-300` | #B197FC | Chấm logo; chữ AI trên nền tối (7,6:1) |
| `ai-600` | #6741D9 | Nhãn "AI tự động" (chữ trắng 6,3:1) |
| `ai-500` | #7950F2 | Nhãn AI ở dark mode (chữ trắng 4,95:1) |

**Trung tính**

| Token | Sáng | Tối |
|---|---|---|
| `bg` | #F6F8F9 | #0E161B |
| `surface` (thẻ, panel) | #FFFFFF | #16222A |
| `border` | #DDE3E7 | #26343D |
| `text` | #0F1C24 (17:1) | #E6EEF2 (15,6:1) |
| `text-muted` | #4A5A66 (7,1:1) | #9FB0BA (8,2:1) |

**Màu trạng thái** (luôn kèm icon hoặc chữ, không dùng màu đơn độc)

| Token | Sáng (chữ/viền) | Tối | Dùng cho |
|---|---|---|---|
| `success` | #237A36 (5,4:1) | #69DB7C | Đã trả lời, đã đồng bộ, đạt |
| `warning` | #B35C00 (4,7:1) | #FFC078 | Sắp hết 24 giờ, 80% hạn mức, chạy thử |
| `danger` | #C92A2A (5,5:1) | #FF8787 | Gửi lỗi, mất kết nối, dừng khẩn cấp |
| `info` | dùng `primary-600` | `primary-300` | Thông tin chung |

**Màu nhãn AI (chip nền nhạt, chữ đậm, mỗi nhãn kèm icon):** Hỏi giá – xanh dương nhạt · Tư vấn – xanh lơ nhạt · Mua hàng – xanh lá nhạt (kèm dấu ưu tiên) · Khiếu nại – đỏ nhạt (kèm dấu ưu tiên) · Spam – xám · Khác – xám nhạt. Chọn sắc độ sao cho chữ trên chip đạt ≥ 4.5:1.

**Tỷ lệ sử dụng màu:** ~80% trung tính · ~15% Flow Teal · ≤ 5% Spark Violet và màu trạng thái. Tím chỉ xuất hiện ở nơi có AI — nhờ vậy người dùng nhìn là biết câu nào do AI viết.

**Biểu tượng nền tảng** (Facebook, Instagram, TikTok, Messenger): dùng icon chính thức theo hướng dẫn thương hiệu của từng nền tảng, kích thước nhỏ, chỉ để nhận diện kênh; không phối màu nền tảng vào giao diện chính.

### 4.4 Chữ

- **Font:** **Be Vietnam Pro** (thiết kế cho tiếng Việt, dấu đẹp) cho toàn bộ giao diện và tiêu đề; số liệu trong bảng dùng tabular numbers. Dự phòng: Inter, hệ thống.
- **Thang chữ:** 12 (chú thích) · 14 (nội dung giao diện mặc định) · 16 (nội dung đọc dài, ô soạn) · 20 (tiêu đề panel) · 24 (tiêu đề trang) · 32/40 (landing).
- **Độ đậm:** 400 nội dung · 500 nhãn/nút · 600 tiêu đề · 700 chỉ cho logo và số liệu lớn.
- Chiều cao dòng 1.5 cho nội dung, 1.25 cho tiêu đề.

### 4.5 Hình khối, khoảng cách, chuyển động

- **Lưới & khoảng cách:** bội số 4px; khoảng cách chính 8 / 12 / 16 / 24 / 32.
- **Bo góc:** 8px cho nút, ô nhập, thẻ; 12px cho panel/modal; 999px cho chip/nhãn; bong bóng chat bo 16px, góc phía người gửi 4px (gợi hình bong bóng trong logo).
- **Viền & bóng:** viền 1px `border`; bóng chỉ cho lớp nổi (dropdown, modal, toast) — mềm, một lớp. Không gradient trong ứng dụng (landing được dùng một nền gradient rất nhẹ Teal → trắng ở hero).
- **Icon:** bộ Lucide, nét 1.5–2px, 16/20px; icon "AI" là chấm/tia nhỏ màu tím, không dùng hình robot.
- **Chuyển động:** 150–200ms ease-out cho hover, mở panel; bình luận mới trượt nhẹ vào danh sách; tôn trọng chế độ giảm chuyển động của hệ điều hành.
- **Hình minh họa:** chỉ ở landing, trạng thái rỗng và onboarding — phong cách phẳng, nét đơn giản, dùng Teal + Violet + trung tính; không ảnh người thật từ kho ảnh, không nhân vật hoạt hình nổi tiếng.

### 4.6 Bố cục & chất lượng

- **Phong cách:** công cụ làm việc gọn, sạch, mật độ thông tin trung bình–cao (giống công cụ helpdesk/inbox).
- **Kích thước màn hình:** thiết kế chính ở **1440px**; kiểm tra **1280px**; tablet 1024px; **mobile 390px chỉ cần trang Bình luận và trang Tin nhắn**.
- **Khả năng tiếp cận:** tương phản chữ ≥ 4.5:1 (bảng màu trên đã đạt); focus ring 2px `primary-600` (tối: `primary-300`) cách 2px; mọi hành động chính dùng được bằng bàn phím; không dùng màu làm tín hiệu duy nhất.
- **Dữ liệu mẫu:** tên shop, người, sản phẩm **hư cấu, rõ là dữ liệu mẫu** ("Shop Mẫu A", "Nguyễn Văn B"). Không dùng thương hiệu hay người thật.

### 4.7 Ứng dụng thương hiệu cần thiết kế

- Trang **Brand guideline** (1 trang tổng hợp): logo + biến thể, khoảng trống, kích thước tối thiểu, bảng màu kèm token, thang chữ, ví dụ đúng/sai.
- Favicon & icon web app; ảnh chia sẻ link (OG image 1200×630); chữ ký email; mẫu email giao dịch (mời thành viên, cảnh báo hạn mức, hóa đơn, tóm tắt tuần); mẫu hóa đơn PDF; avatar và ảnh bìa Fanpage của CommentFlow.
- Xuất **design tokens** (màu, chữ, khoảng cách, bo góc) dạng biến CSS / cấu hình Tailwind, đặt tên đúng như bảng trên.

---

## 5. Sơ đồ trang (sitemap)

```
Công khai
├── Landing page
├── Chính sách quyền riêng tư
├── Điều khoản sử dụng
├── Đăng nhập / Đăng ký / Quên mật khẩu
├── Chấp nhận lời mời (từ email)
└── Trạng thái yêu cầu xóa dữ liệu (tra bằng mã xác nhận — bắt buộc theo Meta)

Onboarding (sau đăng ký lần đầu)
├── B1 Tạo workspace
├── B2 Kết nối nền tảng (Facebook / Instagram / TikTok)
├── B3 Chọn Page / tài khoản
├── B4 Nhập kiến thức nhanh (cửa hàng, sản phẩm, chính sách)
└── B5 Mời nhân viên (bỏ qua được)

Ứng dụng (sau đăng nhập)
├── Bình luận                   ← mặc định
├── Tin nhắn
├── Khách tiềm năng            (số điện thoại, đơn chốt)
├── Bài viết                   (gắn sản phẩm cho bài)
├── Cơ sở kiến thức
│   ├── Nguồn dữ liệu (Shopify, link website)
│   ├── Thông tin cửa hàng
│   ├── Sản phẩm
│   ├── Chính sách
│   ├── Hỏi – đáp (FAQ)
│   ├── Tài liệu
│   ├── Giọng văn
│   ├── Quy tắc trả lời & giới hạn
│   ├── Từ điển viết tắt
│   └── Kiểm thử & phiên bản
├── Tự động hóa
│   ├── Tổng quan
│   ├── Bình luận
│   ├── Tin nhắn
│   ├── Cài đặt chung
│   └── Chạy thử & xem lại
├── Báo cáo
├── Quy tắc spam
├── Nhật ký hoạt động
└── Cài đặt
    ├── Kênh đã kết nối
    ├── Thành viên
    ├── Gói & thanh toán
    ├── Thông báo
    ├── Dữ liệu & quyền riêng tư
    └── Tài khoản & bảo mật

Trang lỗi: 404 · Không có quyền · Mất kết nối mạng
```

---

## 6. Khung ứng dụng (App shell)

- **Sidebar trái (thu gọn được):** logo; menu **Bình luận** (kèm số cần xử lý), **Tin nhắn** (kèm số cần xử lý và chấm đỏ nếu có hội thoại sắp hết 24 giờ), Khách tiềm năng (kèm số mới), Bài viết (kèm số "chưa gắn sản phẩm"), Cơ sở kiến thức, Tự động hóa, Báo cáo, Quy tắc spam, Nhật ký, Cài đặt; **đồng hồ lượt AI** nhỏ ở cuối menu ("2.140 / 3.000 lượt"); cuối sidebar: avatar + tên người dùng + vai trò.
- **Chỉ báo AI tự động** luôn hiện trên thanh trên: "AI tự động: Đang bật ở 2 kênh" + nút **Dừng khẩn cấp** (màu nguy hiểm, có xác nhận 1 bước). Khi đã dừng: banner "AI tự động đang tạm dừng" + nút "Bật lại" (Owner).
- **Thanh trên:**
  - **Bộ chuyển workspace** (dropdown có ô tìm kiếm; quan trọng với agency; hiện số bình luận cần xử lý của từng workspace).
  - **Bộ lọc kênh** (chọn nhiều; nhóm theo nền tảng; avatar kênh + biểu tượng nền tảng + chấm trạng thái kết nối).
  - Ô tìm kiếm nhanh bình luận.
  - Nút trợ giúp (danh sách phím tắt).
- **Ngôn ngữ giao diện:** toàn bộ app có hai ngôn ngữ **Tiếng Việt / English** (chốt 02/11). Bộ chọn ngôn ngữ ở trang đăng nhập và menu tài khoản; lưu theo người dùng. Thiết kế mọi màn hình chính ở cả hai ngôn ngữ, nút và nhãn chịu được chuỗi dài/ngắn hơn ~30%. Nội dung khách không bị dịch; bình luận có nhãn ngôn ngữ VI/EN cạnh nhãn ý định. Trang Tự động hóa cấu hình riêng theo ngôn ngữ (Tiếng Việt / Tiếng Anh).
- **Banner hệ thống** (đặt trên cùng nội dung, có thể nhiều banner):
  - Lỗi: "Page *Shop Mẫu A* đã mất kết nối. Bình luận mới không được cập nhật." → nút **Kết nối lại** (Owner) / "Báo Owner kết nối lại" (Staff).
  - Cảnh báo: "Đã dùng 3/3 kênh của gói Growth."
  - Cảnh báo: "Đã dùng 80% lượt AI tháng này." → nút **Mua thêm lượt**.
  - Lỗi: "Đã hết lượt AI. Bình luận và tin nhắn vẫn vào đầy đủ nhưng AI tạm ngừng xử lý." → **Mua thêm lượt** / **Nâng gói** (Owner); "Báo Owner" (Staff).
  - Thông tin: "Còn 5 ngày dùng thử." → **Chọn gói**.
  - Lỗi: "Gói đã hết hạn — workspace ở chế độ chỉ xem. Dữ liệu được giữ đến 01/12."
  - Thông tin: "AI tạm thời gián đoạn. Bình luận vẫn vào inbox ở mục Cần nhân viên."

---

## 7. Đặc tả từng trang

### 7.1 Trang Bình luận (ưu tiên số 1)

Bình luận và tin nhắn là **hai trang riêng** trên sidebar vì cách làm việc khác nhau: bình luận là công khai, xử lý từng câu một, có ẩn/spam; tin nhắn là hội thoại riêng, có giới hạn thời gian 24 giờ / 7 ngày. Hai trang dùng chung khung 3 cột, bộ thành phần và phím tắt để nhân viên không phải học lại.

**Bố cục 3 cột trên desktop:**

**Cột 1 — Tab trạng thái (hẹp, ~200px):**
- Sẽ tự gửi (số lượng — câu AI đang trong khoảng trễ, hủy được)
- AI đã tự gửi (để xem lại, có nút "Đánh dấu sai")
- Chờ duyệt (số lượng)
- Cần nhân viên (số lượng)
- Nghi spam (số lượng)
- Gửi lỗi (số lượng, màu lỗi, chỉ hiện khi > 0)
- Đã trả lời
- Đã ẩn
- Bỏ qua
- Tất cả
- Phần lọc nhanh bên dưới: theo **nền tảng**, **nhãn AI** (6 nhãn), **chỉ bài quảng cáo**, **giao cho tôi**.

**Cột 2 — Danh sách bình luận (~400px):**
- Mặc định sắp **cũ nhất lên trước** trong tab cần xử lý; nhãn **Mua hàng** và **Khiếu nại** được đẩy lên đầu (có dấu ưu tiên).
- **Thẻ bình luận** gồm: avatar chữ cái đầu tên (hoặc icon mặc định nếu thiếu tên), tên người bình luận (có thể **trống** → hiện "Người dùng Facebook"), 2 dòng nội dung, thời gian tương đối ("5 phút trước"), avatar Page nhỏ, chip **nhãn AI**, biểu tượng **có gợi ý**, chỉ báo **"An đang xử lý"** nếu bị khóa, biểu tượng **quảng cáo** nếu bình luận trên bài quảng cáo.
- Trạng thái thẻ: thường / đang chọn / đã đọc / đang bị người khác khóa / mới đến (hiệu ứng nhẹ).
- Chọn nhiều (checkbox khi hover) → thanh hành động hàng loạt: **Bỏ qua**, **Ẩn** (cần xác nhận), **Đổi nhãn**. Không có "Gửi hàng loạt".
- Có "X bình luận mới — bấm để tải" khi có bình luận mới đến (không tự đẩy danh sách khi người dùng đang đọc).

**Cột 3 — Chi tiết bình luận (phần còn lại):**
1. **Ngữ cảnh bài viết:** biểu tượng nền tảng, ảnh thu nhỏ + 2 dòng nội dung bài, nhãn "Bài quảng cáo" nếu có, link "Mở trên Facebook/Instagram/TikTok", **chip sản phẩm đã gắn** cho bài (hoặc cảnh báo "Bài chưa gắn sản phẩm — AI không tự trả lời câu hỏi giá" + nút "Gắn sản phẩm").
2. **Bình luận:** tên, thời gian chính xác, nội dung đầy đủ; nếu là trả lời trong một chuỗi thì hiện bình luận cha.
3. **Lịch sử người này** (thu gọn): các bình luận trước của cùng người trên Page.
4. **Khối AI:**
   - Chip nhãn + **chỉ báo độ tin cậy** (thanh 3 mức: Cao / Trung bình / Thấp, kèm chữ; không chỉ dùng số).
   - Nút **Đổi nhãn** (dropdown 6 nhãn).
   - Lý do ngắn (tùy chọn): "Khách hỏi giá sản phẩm trong bài".
5. **Ô soạn trả lời:**
   - Điền sẵn gợi ý AI; sửa trực tiếp được; đếm ký tự.
   - Khi đã sửa: hiện nhãn "Đã chỉnh sửa" + nút "Khôi phục gợi ý AI".
   - Dưới ô: **chip nguồn kiến thức** ("Áo thun basic — sản phẩm của bài", "Phí ship nội thành") → bấm mở popover nội dung nguồn.
   - Không có gợi ý (Cần nhân viên): ô trống + dòng giải thích "Cơ sở kiến thức chưa có thông tin để trả lời câu này" + liên kết "Thêm vào kiến thức" (Owner).
6. **Thanh hành động** (cố định cuối cột):
   - **Gửi** (nút chính; phím tắt `Ctrl/⌘ + Enter`)
   - **Ẩn** (phím `H`, mở hộp xác nhận ngắn)
   - **Bỏ qua** (phím `E`)
   - **Nhắn riêng** (private reply, phím `M`): mở ô soạn tin riêng gửi vào hộp thư của người bình luận; sau khi gửi, hội thoại xuất hiện ở trang Tin nhắn kèm liên kết về bình luận gốc. Vô hiệu kèm lý do nếu đã nhắn riêng rồi hoặc quá 7 ngày.
   - Menu "…": Giao cho thành viên, Mở trên Facebook, Xem nhật ký của bình luận
   - Phím `J`/`K` chuyển bình luận tiếp/trước.
7. **Các trạng thái của cột chi tiết phải thiết kế:**
   - **Sẽ tự gửi:** câu AI sắp gửi + đếm ngược "Tự gửi lúc 10:32" + nút **Hủy và sửa**
   - **AI đã tự gửi:** câu đã gửi, nhãn "AI tự động", nguồn kiến thức, nút **Đánh dấu sai** (mở form ghi chú + liên kết sửa kiến thức)
   - **Không tự gửi vì…:** dòng lý do rõ ràng (độ tin cậy thấp / bài chưa gắn sản phẩm / số tiền không khớp nguồn / khách hỏi sản phẩm khác bài / chứa từ khóa chặn / **giá đã đổi sau khi soạn** / **kênh đang bị tạm khóa gửi** / đã có người trả lời trong lúc chờ)
   - Có gợi ý (Chờ duyệt)
   - Không có gợi ý (Cần nhân viên)
   - Nghi spam: hiện "Khớp quy tắc: *Chứa link lạ*" + 2 nút **Ẩn** / **Không phải spam**
   - Đang gửi (nút loading, khóa ô soạn)
   - Gửi thành công (toast "Đã trả lời trên Facebook/Instagram/TikTok" (theo nền tảng) + tự chuyển sang bình luận tiếp theo)
   - **Gửi lỗi**: khung lỗi đỏ với lý do dễ hiểu ("Page mất kết nối", "Facebook đang giới hạn tốc độ, thử lại sau 1 phút", "Không xác định được trạng thái — đã kiểm tra, câu trả lời chưa lên Facebook") + **Thử lại**
   - Đã trả lời: hiện câu trả lời đã gửi, người gửi, thời gian
   - Đã ẩn: nhãn "Đã ẩn trên Facebook" + **Bỏ ẩn**
   - Bị người khác khóa: banner "An đang xử lý bình luận này" + nút "Vẫn mở" (cảnh báo)
   - Bình luận đã bị khách xóa: thông báo, các nút vô hiệu
   - Bình luận đã được khách sửa: nhãn "Đã chỉnh sửa bởi khách" + nội dung mới
8. **Trạng thái rỗng / tải:**
   - Skeleton khi tải danh sách và chi tiết.
   - Rỗng "Chờ duyệt": "Hết việc rồi! Không còn bình luận nào chờ duyệt."
   - Rỗng do chưa kết nối Page: hướng dẫn + nút "Kết nối Page".
   - Rỗng do bộ lọc: "Không có bình luận khớp bộ lọc" + "Xóa bộ lọc".

**Mobile (390px):** danh sách full màn hình, tab trạng thái dạng thanh cuộn ngang; bấm thẻ → chi tiết full màn hình; thanh hành động cố định đáy.

### 7.1b Trang Tin nhắn (ưu tiên số 1)

**Bố cục 3 cột trên desktop** (giống trang Bình luận) + **panel thông tin khách** thu gọn được ở bên phải khung chat.

**Cột 1 — Tab trạng thái (~200px):**
- **Sắp hết 24 giờ** (số lượng, màu cảnh báo; hội thoại còn dưới 2 giờ để trả lời — ưu tiên số 1)
- Sẽ tự gửi (câu AI trong khoảng trễ, hủy được)
- AI đang trả lời (hội thoại AI tự động đang xử lý, nhân viên theo dõi được)
- Chờ duyệt (có gợi ý AI)
- Cần nhân viên (khách đòi gặp người, khiếu nại, AI không chắc)
- Gửi lỗi (chỉ hiện khi > 0)
- Đã xong
- Tất cả
- Lọc nhanh: **nền tảng**, kênh, **nhãn AI**, **bắt đầu từ bình luận** (hội thoại sinh ra từ nhắn riêng), giao cho tôi, chưa đọc.

**Cột 2 — Danh sách hội thoại (~380px):**
- Mỗi dòng là **một hội thoại** (gom theo khách trên một kênh): avatar + tên khách, biểu tượng nền tảng + avatar kênh, **tin cuối** (1 dòng, tiền tố "Bạn:" / "AI:" nếu phía shop gửi), thời gian tin cuối, số tin chưa đọc, chip nhãn AI của tin mới nhất, **đồng hồ cửa sổ nhắn tin** ("còn 3 giờ" → màu cảnh báo khi dưới 2 giờ; "chỉ nhân viên" sau 24 giờ; "hết hạn" sau 7 ngày), chỉ báo "AI tự động" nếu AI đang trả lời hội thoại này, chỉ báo khóa "An đang xử lý".
- Sắp xếp mặc định: **sắp hết 24 giờ lên đầu**, sau đó tin khách chờ lâu nhất.
- Không có ẩn/spam như trang Bình luận; hành động hàng loạt chỉ gồm: Đánh dấu xong, Giao cho, Đổi nhãn.
- "X tin nhắn mới — bấm để tải" khi có tin mới đến.

**Cột 3 — Khung chat:**
1. **Đầu khung:** tên khách, nền tảng + kênh, **chỉ báo cửa sổ nhắn tin** đầy đủ ("Còn 18 giờ để AI/nhân viên trả lời" → "Quá 24 giờ: chỉ nhân viên trả lời, còn 5 ngày" → "Quá 7 ngày: không thể nhắn"), công tắc **AI tự động cho hội thoại này** (kèm lý do nếu đang tự tắt: "Khách yêu cầu gặp nhân viên lúc 10:15"), nút **Đánh dấu xong** (phím `E`), menu "…" (Giao cho, Mở trên nền tảng, Xem nhật ký).
2. **Dòng tin:** bong bóng **khách** (trái), **nhân viên** (phải, kèm tên người gửi), **AI tự động** (phải, kiểu khác rõ ràng + nhãn "AI tự động" + chip nguồn kiến thức bấm được); vạch ngăn ngày; tin nhắn riêng sinh ra từ bình luận hiện **thẻ trích bình luận gốc** (bấm mở trang Bình luận); trạng thái từng tin của shop: đang gửi / đã gửi / lỗi (thử lại). Hiển thị được ảnh khách gửi.
3. **Khối AI cho tin mới nhất của khách:** nhãn + độ tin cậy + Đổi nhãn (giống trang Bình luận).
4. **Ô soạn:** điền sẵn gợi ý AI; nhãn "Đã chỉnh sửa" + "Khôi phục gợi ý AI"; chip nguồn kiến thức; nút **Chèn từ kiến thức** (tìm sản phẩm / chính sách và chèn câu trả lời mẫu); **Gửi** (`Ctrl/⌘ + Enter`). Quá 24 giờ: ô soạn ghi chú "Tin sẽ gửi dưới danh nghĩa nhân viên hỗ trợ" và AI không được tự gửi. Quá 7 ngày: ô soạn khóa + giải thích.
5. **Trạng thái phải thiết kế:** Sẽ tự gửi (đếm ngược + Hủy và sửa) · AI đã tự gửi (Đánh dấu sai) · Không tự gửi vì… (lý do) · Chờ duyệt · Cần nhân viên · Đang gửi · Gửi lỗi (lý do + Thử lại) · Sắp hết 24 giờ (banner cảnh báo trong khung chat) · Chỉ nhân viên (24 giờ – 7 ngày) · Hết hạn nhắn · Bị người khác khóa · Kênh mất kết nối · Kênh chưa cấp quyền tin nhắn ("Kênh này chưa bật tin nhắn — Owner cần cấp quyền").

**Panel thông tin khách (bên phải, thu gọn được, ~280px):**
- Tên, nền tảng, kênh, lần đầu liên hệ.
- **Bình luận của khách này** trên các bài của kênh (bấm mở trang Bình luận).
- **Sản phẩm khách đã hỏi** (từ bài viết đã gắn sản phẩm và từ nội dung hội thoại).
- Ghi chú nội bộ của nhân viên (không gửi cho khách).

**Trạng thái rỗng:** "Không còn hội thoại nào cần trả lời." · Kênh chưa bật tin nhắn → hướng dẫn + nút cho Owner · Rỗng do bộ lọc.

**Mobile (390px):** danh sách hội thoại full màn hình (tab dạng thanh cuộn ngang) → khung chat full màn hình, ô soạn cố định đáy, panel thông tin khách mở dạng sheet từ dưới lên.

### 7.2 Onboarding (wizard 5 bước)

- Thanh tiến trình 5 bước, hiện "khoảng 10 phút". Mục tiêu tổng: **dưới 30 phút đến khi thấy bình luận đầu tiên**.
- **B1 – Tạo workspace:** tên workspace (gợi ý "tên shop hoặc tên khách hàng"), ngành hàng (dropdown).
- **B2 – Kết nối nền tảng:** 3 thẻ Facebook / Instagram / TikTok (nền tảng chưa mở hiện "Sắp có"). Với mỗi nền tảng: giải thích ngắn cần quyền gì và **vì sao** (đọc bình luận, trả lời, ẩn, nhắn tin) + cam kết "Không đăng bài thay bạn". Trạng thái: đang chờ nền tảng, thành công, bị từ chối quyền (giải thích + thử lại), lỗi.
- **B3 – Chọn Page / tài khoản:** danh sách nhóm theo nền tảng (avatar, tên, biểu tượng nền tảng), checkbox; hiện giới hạn gói "Đã chọn 2/3 kênh". Vượt giới hạn → checkbox vô hiệu + liên kết nâng gói. Sau khi xác nhận: tiến trình "Đang kết nối… Đang lấy bài viết và bình luận gần đây…".
- **B4 – Nhập kiến thức nhanh:** đầu bước là 2 lối tắt nổi bật: **"Nhập từ Shopify"** và **"Dán link trang chính sách"**; bên dưới là 3 khối nhập tay: Thông tin cửa hàng (form ngắn), Sản phẩm (nhập tay vài sản phẩm hoặc **tải file Excel/CSV** theo mẫu, có bước khớp cột), Chính sách (mẫu sẵn: ship, đổi trả, thanh toán). Nút "Để sau" (kèm cảnh báo: chưa có kiến thức thì AI chỉ phân loại, không soạn trả lời).
- **B5 – Mời nhân viên:** nhập nhiều email + chọn vai trò; nút "Bỏ qua".
- **Hoàn tất:** tóm tắt (số Page, số FAQ) + nút **Vào trang Bình luận**.

### 7.3 Cơ sở kiến thức (Owner sửa, Staff chỉ xem)

**Bố cục:** menu con bên trái (8 mục), nội dung bên phải; thanh trên cố định: **trạng thái phiên bản** ("Bản nháp — 3 thay đổi chưa xuất bản" / "Đã xuất bản v12 lúc 20:15"), nút **Xem thay đổi**, **Chạy kiểm thử**, **Xuất bản** (chính). Mỗi mục có bộ chọn **phạm vi áp dụng** (Tất cả kênh / chọn kênh). Thanh "Độ đầy đủ kiến thức" gợi ý mục còn thiếu.

- **Nguồn dữ liệu:**
  - **Thẻ Shopify:** chưa kết nối → ô nhập tên miền `*.myshopify.com` + nút "Kết nối Shopify" + giải thích "Chỉ đọc sản phẩm, tồn kho, chính sách, trang nội dung; không thay đổi gì trên cửa hàng của bạn". Đã kết nối → tên cửa hàng, đơn vị tiền, trạng thái đồng bộ (Đang đồng bộ / Đã đồng bộ lúc 20:41 / Lỗi) + dòng **đối soát**: "Đối soát lần cuối 02:00 — 0 lệch" hoặc "— đã cập nhật 12 giá bị lệch" (bấm xem danh sách sản phẩm, giá cũ → giá Shopify), cảnh báo "Webhook Shopify bị gỡ — đã đăng ký lại", nút **Đối soát ngay** (mờ đi 1 giờ sau mỗi lần bấm), số sản phẩm · chính sách · trang đã nhập, nút **Đồng bộ ngay**, **Cài đặt phạm vi**, **Ngắt kết nối**.
  - **Trình hướng dẫn nhập Shopify:** chọn phạm vi (tất cả / theo collection / chỉ sản phẩm đang bán) → chọn chính sách và trang nội dung muốn dùng (checkbox, xem trước nội dung) → bản tóm tắt "Sẽ nhập 128 sản phẩm, 4 chính sách, 2 trang" → xác nhận → thanh tiến trình.
  - **Thẻ Website:** danh sách link đã thêm (URL, loại: đổi trả / vận chuyển / thanh toán / FAQ / khác, trạng thái: đã đọc / có thay đổi chờ duyệt / không đọc được, lần kiểm tra gần nhất), nút **Thêm link**.
  - **Thêm link:** dán một hoặc nhiều URL → chọn loại → **xem trước văn bản trích ra** (sửa/cắt được) → lưu vào bản nháp. Lỗi: "Trang cần đăng nhập", "Không đọc được nội dung — hãy dán văn bản tay".
  - **Tiến trình đồng bộ / lập chỉ mục:** trạng thái (đã lên lịch / đang chạy / xong / lỗi) + bộ đếm *đã xem · đã cập nhật · bỏ qua (không đổi) · lỗi · số đoạn*; chỉ một lượt chạy mỗi lúc (nút Đồng bộ ngay mờ đi khi đang chạy); lỗi toàn bộ → thông báo kèm gợi ý nguyên nhân.
  - **Thay đổi chờ duyệt:** danh sách nội dung nguồn đã đổi (chính sách Shopify, trang website) với **so sánh cũ/mới** (đánh dấu phần thêm/bớt), nút Chấp nhận vào bản nháp / Bỏ qua.
  - Cảnh báo: đơn vị tiền Shopify khác VNĐ; Shopify mất kết nối ("Dữ liệu có thể đã cũ").
- **Thông tin cửa hàng:** form: tên, giờ làm việc theo ngày, địa chỉ, hotline, link đặt hàng, kênh liên hệ khác.
- **Sản phẩm:** bảng (ảnh, tên, mã, biến thể, giá, giá khuyến mãi + ngày hiệu lực, còn hàng, **nguồn**: Shopify / Excel / Nhập tay, số bài đã gắn); lọc theo nguồn; thêm/sửa trong panel — với sản phẩm từ Shopify, tên/giá/tồn kho **khóa** (icon khóa + "Sửa trên Shopify"), chỉ sửa được trường riêng: tên gọi khác, ghi chú cho AI, "không báo giá công khai"; sản phẩm ngừng bán trên Shopify hiện nhãn "Ngừng bán"; **nhập từ Excel/CSV** (tải file → khớp cột → xem trước lỗi → xác nhận); cảnh báo giá khuyến mãi đã hết hạn.
- **Chính sách:** thẻ theo nhóm (Ship — bảng phí/thời gian theo khu vực; Đổi trả; Thanh toán; Bảo hành), có mẫu theo ngành.
- **Hỏi – đáp (FAQ):** danh sách; mỗi mục có nhiều cách hỏi + một câu trả lời chuẩn; số lần AI đã dùng.
- **Tài liệu:** kéo thả PDF/DOCX/TXT; trạng thái xử lý (đang đọc / sẵn sàng / lỗi); xem các đoạn đã tách; xóa.
- **Giọng văn:** chọn xưng hô (shop – bạn / em – anh chị / tùy chỉnh), độ dài tối đa (thanh trượt), dùng emoji (không / ít / nhiều), câu mở và câu kết, chữ ký (ví dụ "— Trợ lý tự động của shop"), **3–5 câu trả lời mẫu**; ô xem trước câu AI viết theo giọng này.
- **Quy tắc trả lời & giới hạn:** theo kênh (bình luận công khai: nói giá / mời nhắn tin; tin nhắn: nói giá); chủ đề cấm (danh sách thẻ); từ khóa bắt buộc chuyển nhân viên; câu nói khi không biết.
- **Từ điển viết tắt:** bảng từ viết tắt / không dấu / teencode → nghĩa (ví dụ "gia bn" → "giá bao nhiêu", "ib" → "inbox", "sz" → "size"); bộ có sẵn của hệ thống (chỉ xem) + bộ riêng của workspace (thêm/sửa); ô thử "Nhập câu khách viết → xem câu sau chuẩn hóa".
- **Kiểm thử & phiên bản:** (a) ô **Thử AI**: nhập câu khách hỏi + chọn bài viết (tùy chọn) → hiện nhãn, câu trả lời, nguồn đã dùng, "Câu này có được tự gửi không? Vì sao"; (b) **bộ câu kiểm thử**: bảng câu hỏi + câu mong đợi + kết quả lần chạy gần nhất (Đạt / Đổi / Lỗi); (c) **lịch sử phiên bản**: ai xuất bản, lúc nào, khác gì, nút khôi phục.
- Hộp xác nhận khi xuất bản thay đổi Sản phẩm/Chính sách: "Các nhãn đang Tự động liên quan sẽ chuyển về Chạy thử cho đến khi bạn xác nhận."

### 7.3b Bài viết (gắn sản phẩm cho bài)

- **Bộ lọc:** nền tảng (tab Facebook / Instagram / TikTok / Tất cả), kênh, loại bài (thường / quảng cáo), khoảng ngày, trạng thái gắn (**Chưa gắn** / Đã gắn / AI gợi ý chờ xác nhận).
- **Danh sách** (dạng bảng có ảnh hoặc lưới thẻ, chuyển được): ảnh/video thu nhỏ, 2 dòng nội dung, biểu tượng nền tảng + tên kênh, nhãn Quảng cáo, ngày đăng, số bình luận / số đang chờ, chip sản phẩm đã gắn, chip "AI gợi ý: Áo thun basic?" với nút ✓ / ✕.
- Mặc định sắp **bài chưa gắn có nhiều bình luận chờ lên đầu**; banner "12 bài chưa gắn sản phẩm đang có bình luận hỏi giá".
- **Gắn hàng loạt:** chọn nhiều bài → "Gắn sản phẩm" → chọn sản phẩm.
- **Panel chi tiết bài:** xem trước bài; **bộ chọn sản phẩm** (tìm theo tên/mã, chọn nhiều, đánh dấu sản phẩm chính); **ghi chú riêng cho bài** có ngày hiệu lực ("Giá livestream 199.000đ đến hết 10/11"); **chế độ trả lời cho bài này** (theo cài đặt kênh / luôn duyệt tay); danh sách bình luận của bài (bấm mở trang Bình luận); dòng giải thích "AI sẽ ưu tiên: ghi chú của bài → sản phẩm đã gắn → kiến thức chung".
- Trạng thái rỗng: chưa có sản phẩm trong cơ sở kiến thức → hướng dẫn thêm sản phẩm trước.

### 7.3c Tự động hóa — quản lý AI tự trả lời bình luận và tin nhắn (Owner sửa, Staff xem + dừng khẩn cấp)

Một trang duy nhất để **bật, theo dõi và cấu hình** AI tự trả lời cho cả bình luận và tin nhắn. Thanh trên cố định: trạng thái tổng ("AI tự động: Đang chạy ở 3/5 kênh" / "Đang tạm dừng toàn bộ"), nút **Dừng khẩn cấp** (màu nguy hiểm), bộ lọc kênh. Gồm **5 tab**:

**Tab 1 — Tổng quan**
- Thẻ số liệu hôm nay, tách Bình luận / Tin nhắn: số câu AI đã tự gửi · đang chờ trong khoảng trễ · bị hủy · bị đánh dấu sai · không tự gửi (bấm xem lý do) · chuyển cho nhân viên · chi phí AI hôm nay so với hạn mức.
- Danh sách **kênh** (nhóm theo nền tảng): mức hiện tại cho bình luận và tin nhắn (Tắt / Chạy thử / Tự động), số câu hôm nay / giới hạn ngày, trạng thái (đang chạy / ngoài giờ hoạt động / tự tạm dừng + lý do), công tắc tạm dừng riêng kênh.
- Danh sách **cảnh báo**: tự tạm dừng vì lỗi, chi phí sắp chạm hạn mức, tỷ lệ đánh dấu sai tăng, kiến thức vừa thay đổi nên một số nhãn đã chuyển về Chạy thử.
- Lịch sử dừng/bật (ai, lúc nào, lý do).

**Tab 2 — Bình luận** (cài đặt)
- **Ma trận mức tự động:** hàng = kênh, cột = Hỏi giá · Tư vấn · Mua hàng; mỗi ô chọn **Tắt / Chạy thử / Tự động**. Cột Khiếu nại · Spam · Khác hiện cố định "Không hỗ trợ tự động". Có hàng "Mặc định cho kênh mới".
- **Kiểu trả lời:** chỉ trả lời công khai · trả lời công khai + nhắn riêng · chỉ nhắn riêng (công khai ghi câu ngắn "Shop đã nhắn tin cho bạn ạ"). Ô soạn **câu công khai mẫu** khi chọn nhắn riêng.
- **Báo giá công khai:** được nói giá trong bình luận / không, mời nhắn tin (mặc định lấy từ Cơ sở kiến thức, ghi đè được ở đây).
- **Giới hạn mỗi người:** tối đa 1 câu AI tự động cho một người trên một bài.
- **Bỏ qua bình luận:** trả lời của chính Page, bình luận chỉ có tag bạn bè / emoji / sticker, bình luận cũ hơn X giờ.

**Tab 3 — Tin nhắn** (cài đặt)
- **Ma trận mức tự động** như tab Bình luận (kênh × Hỏi giá · Tư vấn · Mua hàng). Kênh chưa cấp quyền tin nhắn: hàng vô hiệu + "Owner cần cấp quyền tin nhắn".
- **Tin chào** khi khách nhắn lần đầu (bật/tắt + nội dung; chỉ gửi trong 24 giờ).
- **Tin ngoài giờ** khi khách nhắn ngoài giờ làm việc (bật/tắt + nội dung, ví dụ "Shop sẽ trả lời lúc 8:00 sáng mai").
- **Số lượt AI tối đa trong một hội thoại** trước khi tự chuyển nhân viên (ví dụ 5 lượt).
- **Chuyển nhân viên khi:** khách gõ từ khóa (danh sách thẻ, mặc định "gặp nhân viên", "người thật", "tư vấn viên"), có nhãn Khiếu nại, AI không chắc 2 lần liên tiếp, khách gửi ảnh/tệp. Kèm **câu báo chuyển** gửi cho khách ("Shop chuyển bạn sang nhân viên, vui lòng chờ chút ạ").
- **Thông báo cho nhân viên** khi AI chuyển hội thoại: trong app / email (chọn người nhận).
- Ghi chú cố định về giới hạn nền tảng: "AI chỉ tự trả lời trong 24 giờ kể từ tin cuối của khách. Sau đó chỉ nhân viên trả lời được, tối đa 7 ngày."

**Tab 4 — Cài đặt chung** (áp dụng cho cả bình luận và tin nhắn; chỉnh theo kênh hoặc dùng mặc định workspace)
| Cài đặt | Điều khiển |
|---|---|
| Ngưỡng độ tin cậy để tự gửi | Thanh trượt + mô tả bằng lời (Thận trọng / Cân bằng / Mạnh tay) |
| Khoảng trễ trước khi gửi (để kịp hủy) | 0 / 1 / 2 / 5 phút |
| Giới hạn số câu tự động mỗi ngày | Ô số, theo kênh |
| Giờ hoạt động của AI | 24/7 hoặc lịch theo ngày trong tuần (nhiều khung giờ/ngày) |
| Từ khóa chặn (không bao giờ tự gửi) | Danh sách thẻ, có mẫu gợi ý |
| Chữ ký / công bố trả lời tự động | Bật/tắt + nội dung (ví dụ "— Trợ lý tự động của shop") |
| Hạn mức chi phí AI mỗi tháng | Ô số tiền; đạt 80% cảnh báo, đạt 100% tự tạm dừng |
| Tự tạm dừng khi | Số lần gửi lỗi liên tiếp; tỷ lệ đánh dấu sai trong ngày vượt ngưỡng |
| Khi kiến thức thay đổi | Chuyển các nhãn liên quan về Chạy thử (mặc định bật) |
- Thứ tự ưu tiên hiển thị rõ: **Ghi đè ở bài viết → Cài đặt kênh → Mặc định workspace**; mỗi cài đặt bị ghi đè có chú thích "Đang bị ghi đè ở 3 bài viết".
- Nút **Lưu** + xem trước thay đổi; mọi thay đổi ghi nhật ký.

**Tab 5 — Chạy thử & xem lại**
- **Kết quả chạy thử** theo kênh × nhãn: số câu đã chạy thử, % nhân viên gửi nguyên văn câu AI, % đã sửa, % nhân viên đổi nhãn; danh sách mẫu so sánh "AI sẽ gửi" với "nhân viên đã gửi".
- **Bảng hiệu chuẩn độ tin cậy** theo kênh × nhãn: các khoảng 0,5–0,6 … 0,9–1,0, mỗi khoảng hiện số mẫu và **% bị nhân viên sửa** (thanh ngang, vạch ngưỡng hiện tại).
- **Ngưỡng đề xuất kèm lý do bằng lời**, ví dụ "Nâng lên 0,90: 14% câu có độ tin cậy 0,85–0,90 vẫn bị sửa" hoặc "Chưa đủ dữ liệu: 32/50 mẫu"; nút **Áp dụng đề xuất** (Owner xác nhận). Ngưỡng không bao giờ dưới 0,80.
- Nút **Chuyển sang Tự động** chỉ sáng khi đủ 50 mẫu đã duyệt và các khoảng trên ngưỡng có tỷ lệ sửa ≤ 10%; nếu chưa đạt, hiện điều kiện còn thiếu.
- **Lịch sử AI đã tự gửi:** bảng (thời gian, kênh, bình luận hay tin nhắn, câu khách, câu AI, nguồn kiến thức, kết quả: ổn / bị đánh dấu sai / lỗi); lọc theo kênh, nhãn, kết quả; bấm dòng mở chi tiết; nút **Đánh dấu sai** → form ghi chú + liên kết sửa kiến thức.

**Trạng thái trang phải thiết kế:** chưa kết nối kênh · chưa có kiến thức (khóa chọn Tự động, hướng dẫn) · đang chạy · đang tạm dừng toàn bộ · một kênh tự tạm dừng · ngoài giờ hoạt động · đạt hạn mức chi phí · Staff xem (mọi điều khiển vô hiệu trừ Dừng khẩn cấp).

### 7.4 Quy tắc spam (chế độ thử — dry-run)

- Danh sách quy tắc: tên, điều kiện tóm tắt, phạm vi Page, **chế độ** (badge "Chỉ đánh dấu"), số lần khớp, **tỷ lệ đánh dấu sai** (từ các lần nhân viên bấm "Không phải spam"), công tắc bật/tắt.
- **Trình tạo quy tắc** (panel/modal):
  - Điều kiện (kết hợp AND/OR): chứa từ khóa · chứa link · chứa số điện thoại · AI gắn nhãn Spam.
  - Phạm vi: chọn kênh.
  - **Hành động:** Chỉ đánh dấu (mặc định) · **Tự ẩn** — chỉ chọn được khi điều kiện là *chứa số điện thoại* hoặc *chứa link*, và quy tắc đã chạy chế độ đánh dấu tối thiểu một thời gian (hiện điều kiện còn thiếu). Với quy tắc số điện thoại có thêm ô **"Lưu vào Khách tiềm năng trước khi ẩn"** (mặc định bật).
  - **Xem trước:** "Quy tắc này sẽ khớp **X** bình luận trong 7 ngày qua" + danh sách mẫu để Owner kiểm tra trước khi lưu.
- Ghi chú cố định: "AI không bao giờ tự ẩn. Chỉ quy tắc số điện thoại/link do bạn bật mới được tự ẩn, và luôn bỏ ẩn được."
- Danh sách bình luận đã bị quy tắc tự ẩn: lọc theo quy tắc, nút **Bỏ ẩn** từng cái hoặc hàng loạt.

### 7.5 Nhật ký hoạt động

- Bảng: thời gian, người thực hiện (hoặc "Hệ thống"), hành động (gửi trả lời / ẩn / bỏ ẩn / đổi nhãn / kết nối Page / sửa FAQ / mời thành viên…), đối tượng, kết quả (Thành công / Lỗi).
- Bộ lọc: người, loại hành động, Page, khoảng ngày, kết quả.
- Bấm một dòng → drawer chi tiết: nội dung trước/sau, mã lỗi (nếu có), liên kết tới bình luận.
- Staff chỉ thấy hành động của mình. Nhật ký **chỉ đọc**.

### 7.6 Cài đặt

- **Kênh đã kết nối:** nhóm theo nền tảng; thẻ mỗi kênh: avatar, tên, biểu tượng nền tảng, trạng thái (Đang kết nối / Mất kết nối / Đã ngắt), thời điểm nhận bình luận/tin nhắn gần nhất, quyền đã cấp (bình luận ✓, tin nhắn ✓/✕), nút **Kết nối lại**, **Ngắt kết nối** (xác nhận, giải thích dữ liệu cũ vẫn giữ). Nút "Thêm kênh" (giới hạn theo gói).
- **Thành viên:** bảng tên, email, vai trò, trạng thái (Đã tham gia / Đang mời), thao tác đổi vai trò, gửi lại lời mời, xóa. Modal mời.
- **Gói & thanh toán (Owner):**
  - Gói hiện tại, kỳ thanh toán, ngày gia hạn; trạng thái (Dùng thử / Đang hoạt động / Quá hạn / Hết hạn).
  - **Đồng hồ sử dụng:** lượt AI đã dùng / hạn mức (thanh + số, tách bình luận / tin nhắn), số kênh đã dùng / giới hạn, dự báo "Với tốc độ hiện tại sẽ hết lượt vào ngày 24/11".
  - Bảng so sánh gói, nút **Nâng gói** / **Mua thêm 1.000 lượt**.
  - **Thanh toán chuyển khoản:** thẻ hiện mã QR, số tiền, **nội dung chuyển khoản bắt buộc** (mã workspace), nút sao chép; trạng thái "Chờ xác nhận" → "Đã nhận thanh toán".
  - Lịch sử hóa đơn (ngày, kỳ, số tiền, trạng thái, tải PDF); thông tin xuất hóa đơn (tên công ty, mã số thuế, địa chỉ, email nhận hóa đơn).
- **Thông báo (mỗi người tự chỉnh):** bật thông báo đẩy trên thiết bị này (hướng dẫn cài web app ra màn hình chính trên điện thoại); chọn sự kiện: bình luận Khiếu nại · Mua hàng · hội thoại sắp hết 24 giờ · AI chuyển hội thoại cho tôi · được giao việc · kênh mất kết nối · sắp hết lượt AI; kênh nhận: đẩy / email; **giờ yên lặng**.
- **Dữ liệu & quyền riêng tư (Owner):** thời gian lưu dữ liệu (hiện mặc định, giải thích); **Xuất toàn bộ dữ liệu** (tạo file, gửi link tải qua email); **Xóa workspace** (xác nhận nhiều bước, nhập tên workspace); danh sách yêu cầu xóa dữ liệu từ người dùng Facebook/Instagram (mã, ngày, trạng thái); liên kết Chính sách quyền riêng tư và Thỏa thuận xử lý dữ liệu.
- **Tài khoản & bảo mật:** họ tên, email, đổi mật khẩu, **xác thực 2 bước** (quét mã QR bằng ứng dụng xác thực, mã dự phòng; bắt buộc với Owner), phiên đăng nhập đang hoạt động (đăng xuất từ xa), ngôn ngữ, giao diện sáng/tối, đăng xuất.

### 7.6b Báo cáo

- Bộ chọn khoảng thời gian (hôm nay / 7 ngày / 30 ngày / tùy chọn), lọc nền tảng, kênh; so sánh với kỳ trước.
- **Hàng chỉ số:** tổng bình luận · tổng tin nhắn · **thời gian phản hồi trung vị** · % trả lời trong 15 phút · % do AI tự xử lý · số khách tiềm năng thu được · số giờ nhân viên ước tính tiết kiệm (ghi rõ cách tính).
- **Biểu đồ:** số bình luận/tin nhắn theo ngày (tách AI tự gửi / nhân viên / chưa trả lời); thời gian phản hồi theo ngày; phân bố nhãn; giờ cao điểm trong ngày (lưới giờ × thứ).
- **Bảng:** bài viết nhiều bình luận hỏi giá nhất (kèm trạng thái gắn sản phẩm); hiệu suất từng nhân viên (số đã xử lý, thời gian phản hồi trung vị); câu hỏi AI không trả lời được nhiều nhất (→ nút "Thêm vào kiến thức").
- Xuất CSV; **email tóm tắt hằng tuần** cho Owner (bật/tắt).
- Trạng thái rỗng khi chưa đủ dữ liệu ("Cần ít nhất 1 ngày dữ liệu").

### 7.6c Khách tiềm năng

- Danh sách thẻ/bảng: tên, số điện thoại (che bớt với Staff nếu Owner bật), địa chỉ, sản phẩm + số lượng (nếu nhận ra), nguồn (bình luận / tin nhắn, liên kết mở), nền tảng + kênh, thời gian, **trạng thái** (Mới → Đã liên hệ → Đã chốt → Hủy), người phụ trách, ghi chú.
- Bộ lọc: trạng thái, kênh, người phụ trách, khoảng ngày, sản phẩm. Xem dạng bảng hoặc **bảng Kanban theo trạng thái**.
- Panel chi tiết: thông tin trích ra (sửa được, đánh dấu trường do hệ thống tự nhận diện), trích bình luận/tin nhắn gốc, lịch sử thay đổi trạng thái, nút **Gọi** (mở ứng dụng gọi trên điện thoại), **Sao chép số**.
- Hành động hàng loạt: đổi trạng thái, giao người, **Xuất Excel/CSV**.
- Trạng thái rỗng: hướng dẫn bật quy tắc lưu số điện thoại.

### 7.7 Trang công khai

- **Landing page:** hero (thông điệp: trả lời bình luận và tin nhắn trên Facebook, Instagram, TikTok nhanh hơn; AI trả lời từ kiến thức của shop, bạn quyết định mức tự động), 3 lợi ích, mô tả vòng lặp 4 bước, minh họa ảnh chụp trang Bình luận và trang Tin nhắn, bảng giá 3 gói, FAQ, CTA "Dùng thử". Không dùng số liệu khách hàng/lời chứng thực giả.
- **Chính sách quyền riêng tư & Điều khoản & Thỏa thuận xử lý dữ liệu:** trang văn bản dài dễ đọc, mục lục bên trái (cần cho Meta App Review).
- **Trạng thái yêu cầu xóa dữ liệu:** ô nhập mã xác nhận → hiện trạng thái (Đã nhận / Đang xử lý / Đã xóa / Từ chối kèm lý do) bằng lời dễ hiểu.
- **Đăng nhập / Đăng ký / Quên mật khẩu / Chấp nhận lời mời:** form đơn giản, thông báo lỗi rõ ràng.

### 7.8 Trang lỗi

404 · "Bạn không có quyền xem trang này" · "Mất kết nối mạng — đang thử lại".

---

## 8. Thư viện thành phần (component) cần thiết kế, kèm mọi trạng thái

| Thành phần | Biến thể / trạng thái bắt buộc |
|---|---|
| **StatusBadge** (trạng thái bình luận) | Mới · Chờ duyệt · Cần nhân viên · Nghi spam · Đã trả lời · Đã ẩn · Bỏ qua · Gửi lỗi |
| **LabelChip** (nhãn AI) | Hỏi giá · Tư vấn · Mua hàng · Khiếu nại · Spam · Khác; kiểu thường và kiểu "đã đổi bởi người" |
| **ConfidenceMeter** | Cao · Trung bình · Thấp (thanh + chữ) |
| **CommentListItem** | thường · hover · đang chọn · đã đọc · ưu tiên · bị khóa · mới đến · có checkbox |
| **CommentDetail** | các trạng thái ở mục 7.1 |
| **ReplyComposer** | có gợi ý · trống · đã chỉnh sửa · đang gửi · lỗi · vô hiệu |
| **ChannelAvatar** | kèm biểu tượng nền tảng (Facebook / Instagram / TikTok) và chấm trạng thái: kết nối · mất kết nối · đã ngắt · sắp có |
| **PlatformIcon / PlatformTabs** | 3 nền tảng + Tất cả; trạng thái "Sắp có" |
| **AutoModeSelector** | Tắt · Chạy thử · Tự động · Không hỗ trợ (vô hiệu) |
| **AutoSentBadge** | "AI tự động" (dùng trên thẻ, bong bóng chat, nhật ký) |
| **AutoSendCountdown** | đang đếm ngược · đã hủy · đã gửi |
| **NotAutoSentReason** | 8 lý do ở mục 7.1 |
| **EmergencyStopButton** | đang chạy · xác nhận · đã dừng |
| **AutoModeMatrix** | kênh × nhãn; ô thường · bị ghi đè · vô hiệu (chưa cấp quyền) · đủ/chưa đủ điều kiện bật Tự động |
| **ScheduleEditor** | 24/7 · lịch theo ngày, nhiều khung giờ |
| **KeywordTagInput** | thêm · xóa · gợi ý mẫu |
| **OverrideHint** | "Đang bị ghi đè ở N bài viết" |
| **ShadowCompareRow** | AI sẽ gửi vs nhân viên đã gửi: giống · đã sửa · đổi nhãn |
| **MessagingWindowIndicator** | còn trong 24 giờ · chỉ nhân viên (≤ 7 ngày) · hết hạn |
| **ChatBubble** | khách · nhân viên · AI tự động · tin nhắn riêng từ bình luận |
| **ConversationListItem** | thường · chưa đọc · đang chọn · sắp hết 24 giờ · chỉ nhân viên · hết hạn · AI đang trả lời · bị khóa |
| **WindowTimer** | còn nhiều giờ · dưới 2 giờ (cảnh báo) · chỉ nhân viên · hết hạn |
| **CustomerInfoPanel** | mở · thu gọn · chưa có dữ liệu |
| **CommentQuoteCard** | trích bình luận gốc trong khung chat, bấm mở trang Bình luận |
| **ProductPicker** | tìm · chọn nhiều · sản phẩm chính · rỗng |
| **ProductChip** | thường · sản phẩm chính · AI gợi ý (✓/✕) · đã hết khuyến mãi |
| **PostCard / PostRow** | chưa gắn · đã gắn · có gợi ý AI · bài quảng cáo |
| **KnowledgeSourceChip** | sản phẩm · ghi chú bài · FAQ · chính sách · đoạn tài liệu; popover xem nội dung |
| **VersionBar** | bản nháp có thay đổi · đã xuất bản · đang chạy kiểm thử · kiểm thử có lỗi |
| **FileImportWizard** | tải file → khớp cột → xem trước lỗi → xác nhận |
| **SourceBadge** | Shopify · Website · Excel · Nhập tay |
| **SyncStatus** | đang đồng bộ · đã đồng bộ (thời gian) · lỗi · mất kết nối |
| **LockedField** | trường khóa do nguồn ngoài, tooltip "Sửa trên Shopify" |
| **DiffViewer** | so sánh cũ/mới, đánh dấu thêm/bớt, nút chấp nhận/bỏ qua |
| **UrlImportRow** | đang đọc · đã đọc · có thay đổi · không đọc được |
| **TestCaseTable** | Đạt · Đổi kết quả · Lỗi |
| **UsageMeter** | dưới 80% · 80–99% (cảnh báo) · hết (lỗi) · dùng thử |
| **PlanCard** | gói hiện tại · gói đề xuất · không khả dụng |
| **QRPaymentCard** | chờ thanh toán · chờ xác nhận · đã nhận |
| **LeadCard / LeadStatusBadge** | Mới · Đã liên hệ · Đã chốt · Hủy; trường tự nhận diện |
| **KanbanColumn** | kéo thả thẻ, đếm số |
| **KpiTile** | giá trị + so với kỳ trước (tăng/giảm, không chỉ dùng màu) |
| **Chart** | đường theo ngày · cột chồng · lưới giờ × thứ; trạng thái chưa đủ dữ liệu |
| **DateRangePicker** | mốc nhanh + tùy chọn |
| **TwoFactorSetup** | quét QR · nhập mã · mã dự phòng · đã bật |
| **NotificationPrefsTable** | sự kiện × kênh nhận, giờ yên lặng |
| **AbbreviationTable** | từ viết tắt → nghĩa; phạm vi hệ thống / workspace |
| **WorkspaceSwitcher** | đóng · mở · tìm kiếm · có số chờ xử lý |
| **LockIndicator** | "An đang xử lý" |
| **Banner** | lỗi · cảnh báo · thông tin; có/không có nút |
| **Toast** | thành công · lỗi · có nút hoàn tác (ví dụ "Đã ẩn — Hoàn tác") |
| **ConfirmDialog** | ẩn bình luận · ngắt kết nối Page · xóa thành viên |
| **Button** | chính · phụ · nguy hiểm · ghost; thường/hover/focus/loading/vô hiệu (kèm tooltip lý do) |
| **Input / Textarea / Select / Multi-select / Checkbox / Toggle** | thường · focus · lỗi · vô hiệu |
| **Tabs có bộ đếm** | thường · đang chọn · số 0 |
| **Table** | sắp xếp · lọc · phân trang · rỗng · đang tải |
| **Drawer / Side panel / Modal** | |
| **EmptyState** | có hình icon nhẹ, tiêu đề, mô tả, nút |
| **Skeleton** | danh sách, chi tiết, bảng |
| **Stepper** (onboarding) | bước xong · đang làm · chưa tới |
| **RuleConditionBuilder** | thêm/xóa điều kiện, AND/OR |
| **KeyboardShortcutHint** | badge phím nhỏ cạnh nút |

---

## 9. Microcopy (giọng văn) — ví dụ chuẩn

- Nút chính: "Gửi", "Ẩn", "Bỏ qua", "Kết nối lại", "Gắn sản phẩm", "Xuất bản", "Dừng khẩn cấp".
- Thành công: "Đã trả lời trên Facebook."
- AI tự gửi: "AI tự động đã trả lời lúc 10:32."
- Lỗi: nói **chuyện gì xảy ra + làm gì tiếp**, không hiện mã kỹ thuật ở dòng chính ("Page mất kết nối. Owner cần kết nối lại để gửi trả lời.").
- AI không có dữ liệu: "Cơ sở kiến thức chưa có thông tin để trả lời câu này."
- Tránh từ ngữ hứa hẹn quá mức về AI ("tự động 100%", "không bao giờ sai").

---

## 10. Ngoài phạm vi MVP (KHÔNG thiết kế)

Cổng thanh toán thẻ/ví online · AI tự ẩn bình luận (chỉ quy tắc số điện thoại/link do Owner bật mới được tự ẩn) · xóa bình luận · gửi tin nhắn quảng cáo hàng loạt · ứng dụng mobile riêng · đa ngôn ngữ ngoài tiếng Việt.

---

## 11. Kết quả cần giao

1. Trang Brand guideline và design tokens theo mục 4 (logo đã outline, màu, chữ, khoảng cách, bo góc; light + dark) + các ứng dụng thương hiệu ở mục 4.7.
2. Thư viện thành phần ở mục 8 với mọi trạng thái.
3. Màn hình hoàn chỉnh cho mọi trang ở mục 7, ở 1440px, **bằng tiếng Việt; thêm bản tiếng Anh cho Bình luận, Tự động hóa, Cơ sở kiến thức, Onboarding, Đăng nhập** để kiểm độ dài chuỗi.
4. Trang Bình luận và trang Tin nhắn ở 1280px, 1024px và 390px (mobile).
5. Luồng nhấp (prototype) cho 11 luồng: Onboarding B1→Hoàn tất · Duyệt và gửi một bình luận · Ẩn một bình luận nghi spam rồi hoàn tác · Kết nối Shopify và nhập sản phẩm · Dán link trang chính sách rồi duyệt một thay đổi · Gắn sản phẩm cho một bài chưa gắn · Chuyển một nhãn từ Chạy thử sang Tự động · Hủy một câu AI sắp tự gửi rồi bấm Dừng khẩn cấp · Nhắn riêng từ một bình luận rồi tiếp tục hội thoại ở trang Tin nhắn · Hết lượt AI → mua thêm lượt bằng chuyển khoản QR · Bật quy tắc lưu số điện thoại + tự ẩn, rồi xử lý khách tiềm năng đến Đã chốt.
6. Ghi chú bàn giao cho developer: kích thước, trạng thái, phím tắt, quy tắc hiển thị theo vai trò.

**Ngăn xếp kỹ thuật phía code (để thiết kế bám sát):** Next.js + TypeScript, Tailwind CSS, thư viện thành phần kiểu shadcn/ui, icon Lucide.

# PROMPT THIẾT KẾ GIAO DIỆN — CommentFlow AI · Trang quản trị nội bộ (Admin Console)

> Cách dùng: dán toàn bộ file này vào công cụ thiết kế (hoặc gửi designer) **cùng với** file `CommentFlow_UI_Design_Prompt.md`. Trang Admin dùng chung **bộ nhận diện thương hiệu và design tokens ở mục 4** của file đó; file này chỉ mô tả phần riêng của Admin. Mọi yêu cầu là bắt buộc trừ khi ghi "tùy chọn".

---

## 1. Vai trò và nhiệm vụ

Bạn là Senior Product Designer cho công cụ nội bộ của một SaaS B2B. Hãy thiết kế **Admin Console** — nơi đội vận hành CommentFlow AI (hiện là 1 người, sau này vài người) **quản lý khách hàng, thu tiền, kiểm soát chi phí AI và giữ hệ thống chạy ổn**. Ưu tiên: **số liệu chính xác, tìm nhanh, hành động an toàn**. Không cần đẹp kiểu marketing; cần rõ, dày thông tin, khó bấm nhầm.

Thứ tự ưu tiên thiết kế:
1. Tổng quan (dashboard)
2. Workspaces (danh sách + chi tiết một workspace)
3. Thanh toán & hóa đơn (xác nhận chuyển khoản)
4. Chi phí AI & lãi gộp
5. Sức khỏe tích hợp (Meta, Instagram, TikTok, Shopify)
6. Hàng đợi & hệ thống
7. Gói cước, gói thêm, mã giảm giá
8. Quyền riêng tư & yêu cầu xóa dữ liệu
9. Nội dung hệ thống (từ điển viết tắt, mẫu, thông báo)
10. Tính năng thử nghiệm (feature flags)
11. Người quản trị & nhật ký quản trị

---

## 2. Ngữ cảnh

**Sản phẩm:** CommentFlow AI — SaaS giúp shop online và agency tại Việt Nam xử lý bình luận và tin nhắn trên Facebook, Instagram, TikTok bằng AI (gợi ý và tự trả lời có kiểm soát), cơ sở kiến thức nhập tay hoặc từ Shopify/website. Khách là các **workspace**; mỗi workspace có Owner/Staff, các **kênh** đã kết nối, gói cước và hạn mức **lượt AI**.

**Mô hình thu tiền (giá giả thuyết):** Starter 299.000đ – 1 kênh – 1.000 lượt AI · Growth 699.000đ – 3 kênh – 3.000 lượt · Business 1.490.000đ – 10 kênh – 7.500 lượt · gói thêm 149.000đ / 1.000 lượt · dùng thử 14 ngày, 300 lượt. Thanh toán **chuyển khoản qua mã QR có nội dung định danh workspace**; admin xác nhận tay. Chưa có cổng thanh toán online.

**Vì sao trang Admin quan trọng:** chi phí AI thực tế hiện khoảng **$25 / 1.000 lượt**, mục tiêu giảm xuống **≤ $2 / 1.000 lượt**. Admin phải cho thấy ngay **workspace nào đang lỗ**, chi phí AI đi đâu, và cho phép can thiệp (giới hạn, đổi gói, tạm khóa).

**Người dùng Admin (vai trò nội bộ):**

| Quyền | Super Admin | Hỗ trợ (Support) | Kế toán (Finance) |
|---|---|---|---|
| Xem tổng quan, workspace | Có | Có | Có |
| Xem nội dung bình luận/tin nhắn của khách | Chỉ qua "Xem như khách" có lý do | Chỉ qua "Xem như khách" có lý do | Không |
| Xác nhận thanh toán, xuất hóa đơn, hoàn tiền | Có | Không | Có |
| Đổi gói, cộng lượt, gia hạn dùng thử | Có | Có (giới hạn) | Có |
| Tạm khóa / xóa workspace | Có | Không | Không |
| Sửa gói cước, mã giảm giá | Có | Không | Có |
| Cấu hình model AI, feature flags | Có | Không | Không |
| Quản lý người quản trị | Có | Không | Không |

---

## 3. Nguyên tắc bất biến của Admin

1. **Phân biệt rõ đang ở Admin:** dải màu cố định trên cùng ghi "ADMIN — CommentFlow nội bộ" (nền `text` #0F1C24, chữ trắng), favicon riêng. Không bao giờ nhầm với app của khách.
2. **Quyền riêng tư mặc định:** danh sách và chi tiết workspace **không hiển thị nội dung bình luận/tin nhắn, số điện thoại, địa chỉ của khách hàng cuối**. Muốn xem phải dùng **"Xem như khách" (impersonate)**: chọn lý do bắt buộc, chế độ **chỉ đọc** mặc định, thời hạn tối đa 30 phút, dải cảnh báo đỏ suốt phiên, ghi nhật ký; Owner của workspace thấy được trong nhật ký của họ.
3. **Hành động nguy hiểm phải xác nhận:** tạm khóa, xóa, hoàn tiền, đổi giá, đổi model AI → hộp xác nhận nêu hậu quả, nhập lại tên/mã, ghi lý do. Xóa workspace có thời gian chờ (ví dụ 7 ngày) và hủy được.
4. **Mọi hành động admin đều ghi nhật ký** (ai, lúc nào, trước/sau, lý do) và nhật ký không sửa/xóa được.
5. **Số liệu luôn ghi rõ nguồn và thời điểm** ("Cập nhật 21:40", "Chi phí AI tính theo bảng giá ngày …", "tỷ giá 27.000đ/USD — sửa ở Cài đặt").
6. **Đăng nhập Admin bắt buộc 2 bước**, phiên ngắn, tên miền riêng (ví dụ `admin.` …).

---

## 4. Định hướng hình ảnh

- Dùng **design tokens, font Be Vietnam Pro, logo** từ mục 4 của file giao diện chính. Logo Admin = biểu tượng + chữ "CommentFlow" + nhãn **ADMIN** (nền `text`, chữ trắng) thay cho nhãn AI.
- Mật độ **cao**: bảng là thành phần chính; hàng cao 40px, có chế độ gọn 32px; số dùng tabular numbers, căn phải; tiền tệ định dạng `1.490.000đ`, USD `$12.40`.
- Màu: trung tính chủ đạo; Flow Teal cho hành động; Spark Violet chỉ cho thông tin về AI (chi phí AI, lượt AI, model); màu trạng thái cho sức khỏe (đạt / cảnh báo / lỗi) **luôn kèm chữ**.
- Biểu đồ: đường cho xu hướng theo ngày, cột cho so sánh, không biểu đồ tròn khi > 4 phần; mỗi biểu đồ có tiêu đề nói kết luận ("Chi phí AI tăng 18% so với tuần trước").
- Desktop-first 1440px, kiểm tra 1280px; mobile 390px chỉ cần **Tổng quan, Thanh toán chờ xác nhận, Cảnh báo** (để xác nhận chuyển khoản trên điện thoại).
- Dữ liệu mẫu: workspace, tên, số tiền **hư cấu, rõ là mẫu** ("Shop Mẫu A", "Agency Mẫu B").

---

## 5. Sơ đồ trang

```
Admin
├── Tổng quan
├── Workspaces
│   └── Chi tiết workspace (tab: Tổng quan · Gói & thanh toán · Sử dụng & chi phí AI · Kênh · Thành viên · Ghi chú hỗ trợ · Nhật ký)
├── Thanh toán & hóa đơn
│   ├── Chờ xác nhận
│   ├── Hóa đơn
│   └── Quá hạn / hoàn tiền
├── Chi phí AI & lãi gộp
├── Sức khỏe tích hợp
├── Hàng đợi & hệ thống
├── Gói cước & khuyến mãi
├── Quyền riêng tư & dữ liệu
├── Nội dung hệ thống
│   ├── Từ điển viết tắt (hệ thống)
│   ├── Mẫu chính sách theo ngành
│   ├── Mẫu email
│   └── Thông báo toàn hệ thống
├── Tính năng thử nghiệm
└── Quản trị viên & nhật ký
```

---

## 6. Khung ứng dụng

- **Dải ADMIN** cố định trên cùng (nguyên tắc 1). Khi đang "Xem như khách": dải chuyển đỏ "Đang xem như *Shop Mẫu A* — chỉ đọc — còn 24 phút · Lý do: … · **Thoát**".
- **Sidebar trái:** các mục ở sơ đồ trang, kèm **huy hiệu số** cho: thanh toán chờ xác nhận, cảnh báo hệ thống, yêu cầu xóa dữ liệu quá hạn xử lý.
- **Thanh trên:** **ô tìm kiếm toàn cục** (`Ctrl/⌘ + K`) tìm theo tên workspace, email Owner, mã workspace, mã nội dung chuyển khoản, mã hóa đơn, mã yêu cầu xóa dữ liệu; chuyển môi trường (Production / Staging, Staging có nền khác hẳn); tài khoản admin + vai trò.

---

## 7. Đặc tả từng trang

### 7.1 Tổng quan

- **Hàng chỉ số (kỳ: hôm nay / 7 / 30 ngày / tháng này; so với kỳ trước):** MRR · số workspace trả phí · đang dùng thử · tỷ lệ dùng thử → trả phí · workspace rời bỏ trong kỳ · doanh thu thu được · **chi phí AI** · **lãi gộp %** · tổng lượt AI · **chi phí trung bình / 1.000 lượt** (so với mục tiêu $2, có vạch mục tiêu).
- **Biểu đồ:** MRR theo tháng; doanh thu vs chi phí AI theo ngày; chi phí / 1.000 lượt theo ngày với đường mục tiêu; số workspace theo trạng thái.
- **Danh sách cần xử lý ngay:** thanh toán chờ xác nhận · workspace **lãi gộp < 50%** · dùng thử hết hạn trong 3 ngày · kênh mất kết nối hàng loạt · webhook im lặng · hàng đợi tồn · yêu cầu xóa dữ liệu sắp quá hạn. Mỗi dòng có nút đi thẳng tới chỗ xử lý.
- **Hoạt động gần đây:** đăng ký mới, nâng/hạ gói, thanh toán, tạm khóa.

### 7.2 Workspaces

**Danh sách (bảng):** tên + mã, Owner (email che bớt với vai trò Kế toán), gói, trạng thái (Dùng thử / Đang hoạt động / Quá hạn / Hết hạn / Tạm khóa / Chờ xóa), ngày tạo, kỳ gia hạn, số kênh (theo nền tảng), lượt AI tháng này / hạn mức (thanh), **chi phí AI tháng này**, **doanh thu tháng này**, **lãi gộp %** (màu theo ngưỡng + chữ), lần hoạt động gần nhất, cờ sức khỏe (kênh lỗi, sắp hết lượt).
- Bộ lọc: gói, trạng thái, nền tảng, lãi gộp (< 0% / < 50% / ≥ 50%), dùng thử sắp hết, ngày tạo. Sắp xếp mọi cột. Lưu bộ lọc thường dùng. Xuất CSV.

**Chi tiết workspace (tab):**
- **Tổng quan:** thông tin, Owner, gói, trạng thái, ngày tạo/gia hạn, 4 chỉ số (lượt AI, chi phí AI, doanh thu, lãi gộp), cờ sức khỏe; **thanh hành động:** Gia hạn dùng thử · Cộng lượt AI · Đổi gói · Tạm khóa / Mở khóa · Xem như khách · Gửi email cho Owner · Xóa (Super Admin).
- **Gói & thanh toán:** lịch sử gói, hóa đơn, thanh toán, mã giảm giá đã dùng, thông tin xuất hóa đơn.
- **Sử dụng & chi phí AI:** lượt AI theo ngày (bình luận / tin nhắn / tự động / kiểm thử), token vào/ra trung bình mỗi lượt, **tỷ lệ trúng bộ nhớ đệm**, model đã dùng, chi phí theo ngày, dự báo cuối tháng; **giới hạn riêng** (ghi đè hạn mức, trần chi phí AI/tháng cho workspace này).
- **Kênh:** danh sách kênh (nền tảng, trạng thái, quyền đã cấp, sự kiện cuối, lỗi gần nhất), kết nối Shopify/website; **không** hiện nội dung.
- **Thành viên:** tên, email, vai trò, 2 bước bật/tắt, đăng nhập gần nhất; gửi lại lời mời, buộc đặt lại mật khẩu.
- **Ghi chú hỗ trợ:** ghi chú nội bộ theo thời gian, gắn thẻ (VIP, rủi ro rời bỏ, đang hỗ trợ cài đặt).
- **Nhật ký:** hành động admin trên workspace này + phiên "Xem như khách".

### 7.3 Thanh toán & hóa đơn

- **Chờ xác nhận:** danh sách giao dịch khách báo đã chuyển / yêu cầu nâng gói: workspace, gói/gói thêm, số tiền phải trả, **nội dung chuyển khoản bắt buộc**, thời gian tạo. Admin đối chiếu sao kê → **Xác nhận đã nhận** (nhập số tiền thực nhận, ngày, mã giao dịch ngân hàng; lệch số tiền → cảnh báo) hoặc **Từ chối** (lý do). Xác nhận → tự kích hoạt gói/lượt + tạo hóa đơn + email cho Owner.
- **Tìm nhanh theo nội dung chuyển khoản** (dán nội dung từ sao kê → ra đúng workspace).
- **Hóa đơn:** bảng (mã, workspace, kỳ, số tiền, thuế, trạng thái: nháp / đã phát hành / đã gửi / hủy), tải PDF, gửi lại email, trạng thái hóa đơn điện tử (khi đã có nhà cung cấp).
- **Quá hạn / hoàn tiền:** workspace quá hạn thanh toán (số ngày, đã nhắc mấy lần, nút nhắc), hoàn tiền thủ công (lý do, số tiền, ghi nhận).
- Mobile 390px: danh sách Chờ xác nhận + nút Xác nhận/Từ chối dùng được bằng một tay.

### 7.4 Chi phí AI & lãi gộp

- Chỉ số: tổng chi phí AI (USD và VNĐ theo tỷ giá cấu hình), **chi phí / 1.000 lượt** so với mục tiêu, token vào/ra trung bình mỗi lượt, **tỷ lệ lượt được lọc bằng quy tắc** (không gọi AI), **tỷ lệ trúng bộ nhớ đệm**, tỷ lệ dùng prompt caching, tỷ lệ chuyển lên model lớn.
- **Phân rã chi phí:** theo model · theo loại (phân loại / soạn trả lời / tin nhắn / kiểm thử / nhập kiến thức) · theo nền tảng · theo workspace (top 20 tốn nhất, kèm lãi gộp).
- **Biểu đồ:** chi phí theo ngày xếp chồng theo model; chi phí/1.000 lượt theo ngày + đường mục tiêu; phân phối lãi gộp các workspace.
- **Lập chỉ mục kiến thức:** theo workspace — số nguồn, số đoạn, lần đồng bộ gần nhất, lỗi; nút **Lập chỉ mục lại toàn bộ** (bỏ qua hash, cần xác nhận, ghi nhật ký).
- **Cấu hình (Super Admin):** model mặc định cho phân loại và cho soạn trả lời, ngưỡng chuyển lên model lớn, giới hạn token ngữ cảnh, bật/tắt bộ nhớ đệm câu hỏi lặp, bảng giá model (nhập tay, có ngày hiệu lực), tỷ giá; **phiên bản prompt** (danh sách, so sánh, kết quả bộ kiểm thử của từng phiên bản, nút áp dụng / quay lại). Mọi thay đổi cần xác nhận + ghi nhật ký.
- **Cảnh báo:** chi phí/ngày vượt ngưỡng; một workspace tăng đột biến; lãi gộp toàn hệ thống < ngưỡng.

### 7.5 Sức khỏe tích hợp

- Thẻ theo nền tảng: **Facebook · Instagram · TikTok · Shopify · Website**: số kênh kết nối, số mất kết nối, tỷ lệ lỗi API 24 giờ, độ trễ webhook (trung vị / p95), **webhook im lặng** (kênh hoạt động mà không nhận sự kiện trong X giờ), lỗi giới hạn tốc độ, phiên bản API đang ghim + ngày hết hỗ trợ.
- Bảng kênh có vấn đề: workspace, kênh, nền tảng, vấn đề, từ lúc nào, đã báo Owner chưa, nút **Thử đồng bộ lại** / **Gửi email nhắc kết nối lại**.
- Trạng thái App Review / quyền nâng cao từng nền tảng (ghi tay: đã duyệt / đang chờ / bị từ chối + ghi chú).
- **Sức khỏe Meta App (một app dùng chung cho mọi khách):** đồng hồ % mức dùng app (vàng ≥ 75%: đang giảm tốc; đỏ ≥ 90%: chỉ gửi câu do người bấm), biểu đồ 24 giờ, lỗi theo mã (190, 368, 4/17/32/613).
- **Tín hiệu lạm dụng:** bảng workspace/kênh, tín hiệu (tỷ lệ Đánh dấu sai, câu bị xóa sau khi gửi, lỗi 368, tăng đột biến, từ khóa cấm), giá trị/ngưỡng, hành động tự động đã làm → nút **Tạm khóa gửi** (chọn thời hạn 1/24/72 giờ + lý do bắt buộc, Owner được báo; vẫn nhận bình luận) / **Mở lại** / **Đánh dấu đã xử lý**.
- **Đối soát Shopify:** số cửa hàng đối soát đêm qua, số lệch, cửa hàng lệch > 5% hoặc mất webhook.

### 7.6 Hàng đợi & hệ thống

- Hàng đợi: tên, số việc chờ, đang chạy, lỗi, tuổi việc cũ nhất; biểu đồ theo giờ. Danh sách việc lỗi (loại, workspace, lỗi, số lần thử) → **Thử lại** / **Bỏ qua** (cần lý do).
- Tình trạng dịch vụ: web, worker, database, lưu trữ, dịch vụ AI, email; lần sao lưu gần nhất + **lần chạy thử khôi phục gần nhất** (cảnh báo nếu quá 30 ngày).
- Liên kết sang công cụ theo dõi lỗi bên ngoài (chỉ là link).

### 7.7 Gói cước & khuyến mãi

- Bảng gói: tên, giá tháng/năm, số kênh, lượt AI, tính năng (AI tự trả lời, tin nhắn, Shopify, báo cáo…), hiển thị công khai hay ẩn, số workspace đang dùng. Sửa gói tạo **phiên bản giá mới**; workspace cũ giữ giá cũ đến kỳ gia hạn (hiện rõ).
- Gói thêm (lượt AI): giá, số lượt.
- Dùng thử: số ngày, số lượt, gói áp dụng.
- **Mã giảm giá:** mã, % hoặc số tiền, áp dụng cho gói nào, số lần dùng / giới hạn, hạn dùng, trạng thái.
- Xem trước tác động: "Thay đổi này ảnh hưởng 12 workspace khi gia hạn".

### 7.8 Quyền riêng tư & dữ liệu

- **Yêu cầu xóa dữ liệu** (từ Meta/Instagram và từ Owner): mã xác nhận, nguồn, ngày nhận, hạn xử lý, trạng thái (Đã nhận / Đang xử lý / Đã xóa / Từ chối + lý do), người xử lý; đồng bộ với trang tra cứu công khai.
- **Yêu cầu xuất dữ liệu** của workspace: trạng thái, link tải (hết hạn), người yêu cầu.
- **Lịch xóa theo thời gian lưu:** workspace hết hạn sắp bị xóa, nội dung sắp đến hạn xóa; tạm hoãn có lý do (ví dụ đang tranh chấp).
- Nhật ký các phiên "Xem như khách" toàn hệ thống.

### 7.9 Nội dung hệ thống

- **Từ điển viết tắt hệ thống:** bảng từ → nghĩa, ngành, ví dụ, số workspace đã ghi đè; nhập/xuất CSV; ô thử chuẩn hóa.
- **Mẫu chính sách theo ngành** (thời trang, mỹ phẩm, gia dụng…): soạn, xem trước, phiên bản.
- **Mẫu email giao dịch:** mời thành viên, chào mừng, sắp hết dùng thử, 80% / hết lượt AI, hóa đơn, nhắc thanh toán, kênh mất kết nối, tóm tắt tuần; xem trước với dữ liệu mẫu, gửi thử.
- **Thông báo toàn hệ thống:** banner hiện trong app khách (bảo trì, sự cố nền tảng), chọn đối tượng (tất cả / theo gói / theo nền tảng), thời gian hiện, mức độ.

### 7.10 Tính năng thử nghiệm

- Danh sách cờ tính năng (ví dụ "Kênh TikTok", "Tin nhắn Instagram", "Nhập Shopify"): mô tả, **loại** (phát hành / vận hành / kill switch / theo gói), trạng thái (tắt / chỉ nội bộ / theo danh sách workspace / theo % / bật toàn bộ), danh sách workspace được bật, ngày đổi gần nhất, **ngày hết hạn** (cờ phát hành quá hạn hiện cảnh báo).
- **Kill switch** (ví dụ "Tắt mọi AI tự gửi", "Ngừng gửi lên Facebook") hiện thành khối đỏ riêng ở đầu trang; bật cần xác nhận gõ tên cờ + lý do; hiển thị "có hiệu lực trong < 1 phút".
- Chỉ Super Admin sửa; mọi thay đổi ghi nhật ký quản trị. Đặc tả kỹ thuật: `09_System_Architecture.md` §10.

### 7.11 Quản trị viên & nhật ký

- Quản trị viên: tên, email, vai trò (Super Admin / Hỗ trợ / Kế toán), 2 bước (bắt buộc), đăng nhập gần nhất, trạng thái; mời, đổi vai trò, vô hiệu hóa.
- **Nhật ký quản trị:** thời gian, người, hành động, đối tượng, trước/sau, lý do, IP; lọc và xuất CSV; chỉ đọc.

---

## 8. Thành phần riêng của Admin (kèm mọi trạng thái)

| Thành phần | Biến thể / trạng thái |
|---|---|
| **AdminBanner** | thường · Staging · đang xem như khách (đỏ, đếm ngược) |
| **GlobalSearch (⌘K)** | rỗng · đang tìm · kết quả nhóm theo loại · không có kết quả |
| **MetricTile** | giá trị · so với kỳ trước · vạch mục tiêu · đang tải · không có dữ liệu |
| **MarginBadge** | ≥ 70% · 50–69% · < 50% · âm (luôn có số %) |
| **UsageBar** | lượt đã dùng / hạn mức · vượt (gói thêm) · bị ghi đè |
| **HealthFlag** | kênh lỗi · webhook im lặng · sắp hết lượt · quá hạn thanh toán |
| **StatusBadge (workspace)** | Dùng thử · Đang hoạt động · Quá hạn · Hết hạn · Tạm khóa · Chờ xóa |
| **PaymentConfirmRow** | chờ · lệch số tiền · đã xác nhận · từ chối |
| **DangerConfirmDialog** | nêu hậu quả · nhập lại tên/mã · ô lý do bắt buộc · nút nguy hiểm |
| **ImpersonateDialog** | chọn lý do · chỉ đọc / có ghi (Super Admin) · thời hạn |
| **DataTable** | dày/gọn · sắp xếp · lọc · lưu bộ lọc · chọn nhiều · xuất CSV · cột cố định |
| **Chart** | đường + đường mục tiêu · cột chồng · phân phối (histogram) · chưa đủ dữ liệu |
| **QueueRow** | bình thường · tồn đọng · lỗi |
| **FeatureFlagRow** | tắt · nội bộ · danh sách · % · bật |
| **PromptVersionDiff** | so sánh văn bản + kết quả bộ kiểm thử |
| **AuditLogRow** | có trước/sau · có lý do · phiên xem như khách |

---

## 9. Microcopy

- Ngắn, chính xác, có số: "Xác nhận đã nhận 699.000đ từ *Shop Mẫu A*?" · "Thay đổi giá ảnh hưởng 12 workspace khi gia hạn." · "Workspace này đang lỗ 135.000đ tháng này."
- Lỗi nói rõ việc cần làm: "Số tiền thực nhận (650.000đ) thấp hơn số phải trả (699.000đ). Xác nhận một phần hay từ chối?"
- Không dùng từ mơ hồ ("có thể có vấn đề"); nêu nguồn và thời điểm của số liệu.

---

## 10. Ngoài phạm vi (KHÔNG thiết kế)

Hệ thống ticket hỗ trợ đầy đủ (dùng ghi chú hỗ trợ trong workspace) · CRM bán hàng · cổng thanh toán online · công cụ BI tùy biến · chỉnh sửa nội dung bình luận/tin nhắn của khách · gửi tin nhắn cho khách hàng cuối của shop từ Admin.

---

## 11. Kết quả cần giao

1. Màn hình hoàn chỉnh cho mọi trang ở mục 7 (1440px), dùng design tokens của file giao diện chính.
2. Thư viện thành phần mục 8 với mọi trạng thái.
3. Mobile 390px cho: Tổng quan, Thanh toán chờ xác nhận, danh sách cảnh báo.
4. Prototype cho 5 luồng: xác nhận một khoản chuyển khoản → gói được kích hoạt · tìm một workspace đang lỗ → đặt trần chi phí AI → gửi email cho Owner · "Xem như khách" chỉ đọc rồi thoát · đổi phiên bản prompt sau khi so sánh kết quả kiểm thử · xử lý một yêu cầu xóa dữ liệu đến trạng thái Đã xóa.
5. Ghi chú bàn giao: quyền theo vai trò, các hành động cần xác nhận, sự kiện ghi nhật ký.

**Ngăn xếp kỹ thuật:** Next.js + TypeScript, Tailwind CSS, thành phần kiểu shadcn/ui, icon Lucide, cùng monorepo với app khách (route/app riêng, tên miền riêng).

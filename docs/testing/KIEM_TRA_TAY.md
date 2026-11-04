# Kiểm tra tay — danh sách dồn

> Mỗi mục là một tính năng đã merge nhưng **chủ dự án chưa kiểm tra tay** (theo quy trình `docs/PROMPT_BUILD_TOAN_BO.md` §1.5). Thử xong thì ghi kết quả (đạt / không đạt + bước hỏng) vào cột cuối của bảng "Trạng thái" và báo agent. Agent chỉ thêm mục mới ở đầu, không xóa mục chưa thử.
>
> Môi trường: web `http://localhost:3000` (chạy `pnpm --filter @flow/web dev`; xóa `apps/web/.next` nếu Turbopack báo lỗi), hộp thư Mailpit `http://192.168.1.124:8025`. Mỗi bước thử ở **cả tiếng Việt và tiếng Anh** (đổi bằng bộ chọn ngôn ngữ ở góc trên). Dùng email thử dạng `ten+n@example.test` (Mailpit nhận mọi địa chỉ).

## Trạng thái

| Mục | Tính năng | PR | Đã merge | Chủ dự án thử | Kết quả |
|---|---|---|---|---|---|
| KT-001 | Workspace, thành viên, lời mời, chỉ-Owner ở DB | #7, #11 | có | chưa | — |
| KT-002 | Webhook bình luận Facebook (bắt tay, chữ ký, đường nhận) | #19 | có | chưa | — |
| KT-003 | Trang Bình luận (tab, danh sách, tìm, lọc) | #20 | có | chưa | — |
| KT-004 | Khung ứng dụng (thanh trên, điều hướng, đăng xuất, ngôn ngữ) | #21 | có | chưa | — |
| KT-005 | Chi tiết bình luận + khóa mềm (2 trình duyệt) | INBOX-DETAIL-LOCK | chưa | chưa | — |

---

## KT-001 — Workspace, thành viên, lời mời, chỉ-Owner ở DB (PR #7 + #11)

Điều kiện: máy ảo `cf` bật (Postgres, Valkey, Mailpit); migration 0015–0016 đã áp lên `cf_dev` (`pnpm db:migrate`). Mật khẩu tối thiểu 10 ký tự.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng ký tài khoản mới, mở thư xác minh trong Mailpit, bấm link, đăng nhập. | Vào màn **Tạo workspace** (tên, múi giờ mặc định `Asia/Ho_Chi_Minh`, ngôn ngữ mặc định). |
| 2 | Nhập tên workspace, chọn múi giờ/ngôn ngữ khác mặc định, bấm tạo. | Tạo được; bị chuyển sang **/app/security** (Owner bắt buộc bật 2FA) kèm cảnh báo. |
| 3 | Bật 2FA (quét QR hoặc nhập khóa tay, nhập mã 6 số, lưu mã dự phòng), quay về `/app`. | Thấy lời chào kèm **tên workspace**; đầu trang có bộ chuyển workspace và liên kết **Thành viên**. |
| 4 | Vào **Thành viên**, mời một email mới (vai trò Staff). | Thông báo **trung tính** ("nếu email hợp lệ, lời mời đã được gửi"); thư mời xuất hiện trong Mailpit; mục **Lời mời đang chờ** có dòng mới. Mời lại đúng email đang là thành viên cũng ra thông báo y hệt (không lộ email nào có tài khoản). |
| 5 | Bấm **Gửi lại** rồi **Thu hồi** một lời mời. | Gửi lại: thư mới trong Mailpit (link cũ không dùng được nữa). Thu hồi: dòng biến mất; mở link của thư đã thu hồi ra màn "Không dùng được lời mời này". |
| 6 | Mở link mời mới nhất trong **cửa sổ ẩn danh**, bấm "Đăng ký tài khoản mới" bằng **đúng email được mời**, xác minh email, đăng nhập. | Tự quay lại trang lời mời; bấm **Chấp nhận** → vào workspace với vai trò **Staff**; Staff **không thấy** liên kết Thành viên và mở `/app/members` ra **404**. |
| 7 | Ở cửa sổ Owner: đổi Staff thành Owner, hạ lại Staff; tạm khóa rồi mở khóa Staff. | Thao tác chạy được, danh sách cập nhật ngay. Khi Staff trở thành Owner (và khi hạ), **mọi Owner nhận email báo** trong Mailpit. Khi Staff bị tạm khóa, tài khoản đó không còn thấy workspace. |
| 8 | Thử tự hạ/khóa/gỡ chính mình, và gỡ Owner đang hoạt động **cuối cùng**. | Không có nút cho chính mình; Owner cuối cùng bị từ chối với thông báo "workspace phải luôn còn ít nhất một Owner". |
| 9 | Tạo workspace thứ hai (từ bộ chuyển → "Tạo workspace mới"), chuyển qua lại giữa hai workspace. | Tên workspace đổi đúng; dữ liệu Thành viên là của workspace đang chọn. |
| 10 | Lặp lại bước 1–4 bằng **giao diện tiếng Anh** với một tài khoản/email khác. | Chuỗi đúng tiếng Anh (không còn chữ Việt, không lộ mã lỗi thô); kết quả y hệt tiếng Việt. |

Thử thêm (không bắt buộc): dùng link mời khi đăng nhập bằng **email khác** email được mời → thông báo trung tính, không tham gia được; tạo quá 5 workspace trong một ngày → thông báo giới hạn.

Nếu hỏng: ghi số bước, ảnh chụp màn hình (che email thật nếu có) và nội dung hiện trên màn hình; dán vào báo cáo cho agent.
---

## KT-002 — Webhook bình luận Facebook: bắt tay, chữ ký, đường nhận (WH-INGEST)

Điều kiện: máy ảo `cf` bật; `pnpm db:migrate` (0022) và `pnpm --filter @flow/worker queue:install` đã chạy trên `cf_dev`; trong `.env.local` có `META_APP_SECRET` và `META_WEBHOOK_VERIFY_TOKEN` (giá trị tự chọn khi chưa dùng Meta thật). Bước 5–8 cần một **kênh đã kết nối** — chỉ có sau `FB-OAUTH`; trước đó chỉ làm bước 1–4 (hoặc nhờ agent gieo một kênh thử).

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/web dev` và `pnpm --filter @flow/worker dev`. | Web ở cổng 3000, worker báo "worker đã khởi động"; thiếu khóa cho phiên bản token đang dùng thì worker dừng với thông báo rõ. |
| 2 | Mở `http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=<META_WEBHOOK_VERIFY_TOKEN>&hub.challenge=12345` trên trình duyệt. | Trang chỉ hiện đúng `12345`. |
| 3 | Lặp lại với verify token **sai**. | Trả 403 (trang trống), không lộ token. |
| 4 | Gửi POST **không chữ ký**: `curl -i -X POST http://localhost:3000/api/webhooks/meta -d "{}"`. | `HTTP 401`; không có dòng nào mới trong `cf.webhook_events`. |
| 5 | (Sau FB-OAUTH) `pnpm webhook:send -- --page <PAGE_ID của kênh thử>`. | In `HTTP 200 ok`. |
| 6 | Vài giây sau mở trang **Bình luận** (sau INBOX-LIST) hoặc hỏi agent kiểm `cf.comments`. | Có đúng một bình luận mới, trạng thái `new`. |
| 7 | Chạy lại đúng lệnh bước 5 hai lần nữa. | Mỗi lần 200; thêm 2 bình luận **khác nhau** (id ngẫu nhiên), không lỗi. |
| 8 | Với Meta thật (tunnel, docs/CAN_BAN_CUNG_CAP.md §2): bình luận trên Fanpage thử bằng tài khoản **khác** Page; rồi để chính Page trả lời bình luận đó. | Bình luận của khách xuất hiện; câu trả lời của chính Page **không** xuất hiện. |

Nếu hỏng: ghi số bước, mã HTTP và dòng log của web/worker (che tên khách); không dán `META_APP_SECRET`.

---

## KT-003 — Trang Bình luận: tab, danh sách, tìm, lọc (INBOX-LIST)

Điều kiện: đã đăng nhập vào một workspace (Owner hoặc Staff); trong DB có **vài bình luận** để thấy danh sách (cần một kênh đã kết nối + `webhook_subscribed` — sau `FB-OAUTH` — rồi chạy `pnpm webhook:send -- --page <PAGE_ID>` vài lần, hoặc nhờ agent gieo dữ liệu thử vào `cf_dev`). Chạy `pnpm --filter @flow/web dev`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Bấm **Bình luận** ở thanh trên. | Mở `/app/comments`: cột trái là các tab kèm số, ở giữa danh sách, bên phải khung "Chọn một bình luận…". Mặc định tab **Chờ duyệt**. |
| 2 | Bấm tab **Mới** (bình luận từ webhook mới nằm ở đây). | Danh sách hiện bình luận vừa gửi (tên khách, kênh, thời gian "x phút trước", nội dung, nhãn trạng thái **Mới**); số trên tab khớp số dòng ("Hiển thị N / N"). |
| 3 | Gõ một từ trong nội dung (thử cả không dấu, ví dụ "gia" cho "giá") vào ô tìm kiếm, bấm **Áp dụng**. | Chỉ còn bình luận khớp, không phân biệt hoa/thường và dấu; số trên các tab cũng đổi theo bộ lọc. |
| 4 | Tìm bằng ký tự đặc biệt `%` hoặc `_`. | Không lỗi, không hiện tràn mọi bình luận. |
| 5 | Chọn một nền tảng/kênh trong ô lọc, bật **Chỉ bài quảng cáo**, rồi bấm **Xóa bộ lọc**. | Danh sách thu hẹp đúng; "Xóa bộ lọc" trả về đầy đủ. |
| 6 | Đổi **Sắp xếp** giữa "Cũ nhất trước" và "Mới nhất trước". | Thứ tự đảo đúng. |
| 7 | Nếu có > 25 bình luận: bấm **Xem trang kế tiếp**, rồi **Về trang đầu**. | Không lặp/sót bình luận giữa các trang. |
| 8 | Thu nhỏ cửa sổ về ~390px (hoặc xem trên điện thoại). | Các cột xếp dọc; tab thành hàng cuộn ngang; không bị tràn ngang trang. |
| 9 | Đổi ngôn ngữ giao diện sang **English** (và quay lại). | Mọi chữ trên trang (tab, nhãn trạng thái, nút, thời gian) đổi đúng; không còn chữ Việt ở bản English. |
| 10 | Đăng nhập một workspace khác (hoặc người không thuộc workspace) mở `/app/comments`. | Chỉ thấy bình luận của workspace đang chọn; không thấy dữ liệu workspace khác. |

Nếu hỏng: ghi số bước, ảnh chụp (che tên khách) và nội dung hiện trên màn hình.

## KT-004 — Khung ứng dụng: thanh trên, điều hướng, đăng xuất, ngôn ngữ (APP-SHELL)

Điều kiện: đã đăng nhập (Owner), có workspace. Chạy `pnpm --filter @flow/web dev`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở `/app`. | Thấy thanh trên (CommentFlow AI, bộ chuyển workspace, ngôn ngữ, tên bạn, **Đăng xuất**) và thanh điều hướng bên trái (nhóm **Điều hướng vận hành**: Bình luận; nhóm **Cài đặt**: Thành viên, Bảo mật). |
| 2 | Bấm **Bình luận**, rồi **Thành viên**, rồi **Bảo mật**. | Mỗi trang mở trong khung; mục đang mở được tô nền/đậm; không có hai thanh cuộn dọc hay tràn ngang. |
| 3 | Thu nhỏ cửa sổ về ~390px. | Thanh điều hướng thành hàng ngang cuộn được dưới thanh trên; nội dung không tràn ngang. |
| 4 | Dùng phím Tab đi qua thanh trên và điều hướng; bấm Enter ở một mục. | Có viền focus rõ; điều hướng được bằng bàn phím. |
| 5 | Đổi ngôn ngữ sang **English**, rồi quay lại **Tiếng Việt**. | Mọi nhãn (nhóm, mục, Đăng xuất) đổi đúng; không còn chữ Việt ở bản English. |
| 6 | Bấm **Đăng xuất**. | Về trang đăng nhập (thông báo đã đăng xuất); mở lại `/app` thì bị chuyển về đăng nhập. |
| 7 | Đăng nhập bằng tài khoản **Staff** (đã được mời). | Thanh điều hướng **không có** Thành viên (chỉ Bình luận và Bảo mật); gõ tay `/app/members` → trang 404. |
| 8 | Tạo/chuyển sang workspace khác bằng bộ chuyển workspace. | Khung giữ nguyên; tên workspace đổi; điều hướng theo vai trò ở workspace mới. |

Nếu hỏng: ghi số bước, ảnh chụp và nội dung hiện trên màn hình.

---

## KT-005 — Chi tiết bình luận + khóa mềm (INBOX-DETAIL-LOCK)

Điều kiện: có ít nhất 2 bình luận trong DB (xem KT-003); **hai tài khoản** cùng workspace (Owner + Staff đã được mời) mở ở **hai trình duyệt/cửa sổ ẩn danh khác nhau**. Chạy `pnpm --filter @flow/web dev`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Tài khoản A: ở trang **Bình luận**, bấm một bình luận trong danh sách. | Cột phải hiện chi tiết (tên khách, thời gian, kênh, bài viết, mã người bình luận, nội dung đầy đủ, trạng thái); thanh địa chỉ có `c=<mã>`; dòng được chọn tô nền; có dòng "Bạn đang xử lý bình luận này (khóa mềm 2 phút…)". |
| 2 | Tài khoản B: mở trang Bình luận (cùng tab/bộ lọc). | Dòng bình luận A đang mở có nhãn **"<tên A> đang xử lý"**. |
| 3 | B bấm đúng bình luận đó. | Cột phải hiện cảnh báo **"<tên A> đang xử lý bình luận này (còn khoảng N giây). Bạn chỉ xem được."**; nội dung vẫn xem được. |
| 4 | A bấm sang bình luận khác (hoặc đóng chi tiết bằng cách đổi tab). | Khóa của bình luận cũ được mở: B tải lại thì nhãn "đang xử lý" biến mất; B bấm vào được và thấy "Bạn đang xử lý". |
| 5 | A mở một bình luận rồi **đóng hẳn tab trình duyệt**; đợi hơn 2 phút; B mở bình luận đó. | Sau khi hết hạn, B lấy được khóa (không còn cảnh báo). |
| 6 | A giữ nguyên một bình luận mở > 3 phút, rồi B mở bình luận đó. | B vẫn thấy cảnh báo (khóa tự gia hạn mỗi 60 giây khi còn mở). |
| 7 | Dán một `c=` sai (ví dụ `c=abc`) hoặc mã của workspace khác lên URL. | Với mã sai: không có chi tiết (như chưa chọn); với mã đúng định dạng nhưng không thấy: hiện "Không tìm thấy bình luận". Không lỗi trắng trang. |
| 8 | Đổi sang **English**, xem lại bước 1–3. | Mọi chữ đúng tiếng Anh. |
| 9 | Thu nhỏ về ~390px. | Chi tiết xuống dưới danh sách; không tràn ngang. |

Nếu hỏng: ghi số bước, ảnh chụp (che tên khách) và nội dung hiện trên màn hình.

---

---

## Mẫu cho mục mới

```
## KT-00N — <tên tính năng> (PR #...)
Điều kiện: ...
| # | Bước | Kết quả mong đợi |   (≤ 10 bước, cả vi và en)
```

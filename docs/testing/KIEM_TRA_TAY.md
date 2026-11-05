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
| KT-005 | Chi tiết bình luận + khóa mềm (2 trình duyệt) | #22 | có | chưa | — |
| KT-006 | Banner trạng thái kênh | #23 | có | chưa | — |
| KT-007 | Hộp soạn trả lời, Gửi, Thử lại | #26 | có | chưa | — |
| KT-008 | Khách sửa/xóa bình luận | COMMENT-EDIT-DELETE | chưa | chưa | — |
| KT-009 | Trang Nhật ký (Owner thấy tất cả, Staff chỉ của mình) | LOG-PAGE | chưa | chưa | — |
| KT-010 | Connector Facebook thật: trả lời, ẩn/bỏ ẩn, đăng ký webhook (**cần Page thật + token**) | feat/fb-connector | có | chưa | — |

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

## KT-006 — Banner trạng thái kênh (CH-STATUS-BANNER)

Điều kiện: có ít nhất một kênh trong workspace; nhờ agent đặt thử một kênh sang `expired`/`revoked`/`error` trên `cf_dev` (hoặc tự sửa cột `status` bằng công cụ DB). Chạy `pnpm --filter @flow/web dev`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Khi mọi kênh `connected`, mở `/app/comments`. | Không có banner. |
| 2 | Đặt một kênh sang `expired`, tải lại trang (F5). | Banner đỏ ở đầu nội dung: "Kênh hết hạn kết nối: <tên kênh>." kèm hướng dẫn; Owner thấy "Bạn (Owner) cần kết nối lại…", Staff thấy "Hãy báo chủ workspace (Owner)…". |
| 3 | Đặt thêm một kênh khác sang `revoked` và một kênh sang `error`. | Mỗi tình trạng một banner riêng (expired → revoked → error); nhiều hơn 3 kênh cùng loại thì ghi "và N kênh khác". |
| 4 | Chuyển giữa Bình luận, Thành viên, Bảo mật. | Banner hiện ở mọi trang trong khung. (Banner cập nhật sau lần tải đầy đủ kế tiếp, không tức thời.) |
| 5 | Đặt kênh về `connected`, tải lại. | Banner biến mất. |
| 6 | Đổi sang **English**. | Banner đúng tiếng Anh. |
| 7 | Thu nhỏ ~390px. | Banner không tràn ngang, chữ xuống dòng. |

Nếu hỏng: ghi số bước, ảnh chụp và nội dung hiện trên màn hình.

---

## KT-007 — Hộp soạn trả lời, Gửi, Thử lại (FB-REPLY giao diện + FB-RETRY-UI)

Điều kiện: có bình luận ở trạng thái Chờ duyệt/Mới trên một kênh `connected` (xem KT-003). **Chưa có connector Facebook thật** nên khi bấm Gửi, worker (`pnpm --filter @flow/worker dev`, đã `queue:install`) sẽ báo lỗi "Chưa kết nối được tới nền tảng để gửi" — đó là kết quả ĐÚNG ở bước này; gửi thật chỉ thử được sau `FB-OAUTH` + connector Facebook. Chạy `pnpm --filter @flow/web dev`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở một bình luận Chờ duyệt ở trang Bình luận. | Dưới chi tiết có ô **Câu trả lời** (đếm ký tự "0 / 8000", gợi ý "Ctrl/⌘ + Enter để gửi") và nút **Gửi** (xám khi ô trống). |
| 2 | Gõ một câu rồi bấm **Gửi** (hoặc Ctrl/⌘+Enter). | Nút đổi thành "Đang gửi…" rồi hộp soạn được thay bằng "Đang gửi câu trả lời…" kèm câu của bạn; bấm đúp không gửi hai lần. |
| 3 | Đợi vài giây (worker chạy). | Trạng thái chuyển thành **Gửi lỗi** + "Lý do: Chưa kết nối được tới nền tảng để gửi…" và có hộp soạn mới với câu cũ điền sẵn + nút **Thử lại**. |
| 4 | Sửa câu rồi bấm **Thử lại**. | Lại thấy "Đang gửi…" rồi kết quả; không có bình luận nào chuyển sang "Đã trả lời" khi chưa có connector thật. |
| 5 | Để ô trống/chỉ khoảng trắng hoặc gõ > 8000 ký tự. | Nút Gửi bị khóa (không gửi được). |
| 6 | Hai tài khoản: A mở bình luận (khóa), B mở cùng bình luận. | B thấy "<tên A> đang xử lý… nên bạn chưa trả lời được", không có ô soạn. |
| 7 | Đặt kênh sang `expired` (nhờ agent) rồi mở bình luận. | Thấy "Kênh chưa kết nối được nên chưa gửi được…", không có ô soạn. |
| 8 | Đổi sang **English** và thu nhỏ ~390px. | Mọi chữ đúng tiếng Anh; không tràn ngang. |
| 9 | (Sau FB-OAUTH + connector Facebook) Gửi một câu cho bình luận trên Page thử. | Chuyển "Đã trả lời" kèm câu đã gửi; trên Facebook xuất hiện câu trả lời của Page, không trùng. |

Nếu hỏng: ghi số bước, ảnh chụp (che tên khách) và nội dung hiện trên màn hình.

---

## KT-008 — Khách sửa/xóa bình luận (COMMENT-EDIT-DELETE)

Điều kiện: có kênh `connected` + `webhook_subscribed` (sau `FB-OAUTH`) và worker đang chạy; hoặc thử bằng `pnpm webhook:send` (chỉ tạo bình luận mới — thử sửa/xóa thật cần Meta thật). Bước 1–3 cần Page thử.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Trên Facebook, dùng tài khoản khách bình luận vào bài của Page thử; đợi vài giây. | Bình luận xuất hiện ở tab **Mới/Chờ duyệt**. |
| 2 | Khách **sửa** nội dung bình luận; đợi vài giây; tải lại panel chi tiết. | Nội dung trong inbox đổi theo bản đã sửa. Sửa lần hai cũng cập nhật. |
| 3 | Khách **xóa** bình luận; đợi vài giây; tải lại danh sách. | Bình luận biến mất khỏi danh sách và số trên tab giảm; mở trực tiếp bằng đường dẫn `?c=` thì thấy "Khách đã xóa bình luận này trên nền tảng nên không thể trả lời." và không có ô soạn. Panel chi tiết cũng ghi nội dung và thông tin người bình luận đã bị xóa khỏi hệ thống (không còn nội dung/tên/mã khách). |
| 4 | (Tùy chọn) Bấm Gửi trả lời cho một bình luận rồi để khách xóa nó trước khi worker gửi. | Yêu cầu bị hủy (không gửi lên Facebook); bình luận trở về trạng thái trước. |
| 4b | Nhờ agent kiểm dòng bình luận trong DB. | `text` rỗng, `author_name` trống, `redacted_at` có giá trị; trạng thái, thời điểm tạo, nhật ký vẫn còn. |
| 5 | Nhờ agent kiểm `cf.action_logs`. | Có dòng `comment.edited`/`comment.deleted` (actor hệ thống), KHÔNG chứa nội dung bình luận. |

Nếu hỏng: ghi số bước, ảnh chụp (che tên khách) và nội dung hiện trên màn hình.

---

## KT-010 — Connector Facebook thật (FB-CONNECTOR-CONTRACT, ADR 010)

**Chưa thử được ở bước này:** connector mới chỉ có code + test bằng phản hồi viết tay; CHƯA đăng ký vào worker nên giao diện vẫn báo "Chưa kết nối được tới nền tảng để gửi" (đúng, xem KT-007). Mục này dành cho SAU KHI có `FB-OAUTH` + một Page thử + token thật và connector được nối vào worker (gap `FB-CONNECTOR-REGISTER`, `SEND-FIND-REPLY-BY-PARENT`). Dùng Page thử, không dùng Page khách.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Dùng một tài khoản khác bình luận dưới bài của Page thử | Bình luận vào hộp thư (webhook) |
| 2 | Bấm Gửi trả lời | Trên Facebook có câu trả lời dưới bình luận đó, đúng nội dung; hộp thư hiện "đã trả lời" |
| 3 | Bấm Ẩn rồi Bỏ ẩn (khi FB-HIDE đã nối) | Facebook ẩn/hiện bình luận tương ứng; không có nút xóa |
| 4 | Gỡ quyền Page của ứng dụng rồi thử Gửi | Báo lỗi dễ hiểu (mất quyền), kênh chuyển trạng thái cần kết nối lại; log KHÔNG chứa token |
| 5 | Bình luận có `from` của khách: đọc lại trả lời của chính Page (kiểm trước khi gửi lại) | Thấy câu trả lời của Page (`isFromPage` đúng); nếu KHÔNG thấy → báo agent (xem ADR 010 §4) |
| 6 | Đăng ký webhook cho Page (`subscribed_apps`) rồi đọc lại | Trường `feed` được liệt kê |

---

## KT-009 — Trang Nhật ký (LOG-PAGE, FR-092)

Điều kiện: chạy `pnpm --filter @flow/web dev`; có workspace với một Owner và một Staff đã nhận lời mời. Trang đọc dữ liệu THẬT từ `action_logs` nên cần tự tạo vài hành động trước (không có số liệu giả): tạo workspace, mời Staff, Staff nhận lời mời, Owner đổi vai trò một thành viên (hoặc Staff bấm Gửi trả lời ở một bình luận, xem KT-007).

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập bằng **Owner**, mở **Cài đặt > Nhật ký** (`/app/activity`). | Thấy các dòng vừa tạo, mới nhất trên cùng; dòng ghi giờ theo múi giờ của workspace; có nhãn "Chỉ đọc". |
| 2 | Bấm một dòng "Đổi vai trò thành viên". | Cột bên phải hiện thời điểm, người thực hiện, đối tượng và bảng **Trước/Sau** (ví dụ `role`: staff → owner). Không có email, mã truy cập hay nội dung bình luận. |
| 3 | Lọc theo **Tác nhân = Thành viên**, theo một **Hành động**, theo **Từ ngày/Đến ngày**; bấm Lọc, rồi "Xóa bộ lọc". | Danh sách chỉ còn dòng khớp; khoảng ngày không có dòng hiện "Không có dòng phù hợp"; Xóa bộ lọc trả về đầy đủ. |
| 4 | Đăng nhập bằng **Staff** (cửa sổ ẩn danh), mở `/app/activity`. | Chỉ thấy các dòng do chính Staff thực hiện; không có ô lọc "Tác nhân"; không thấy dòng của Owner/hệ thống. |
| 5 | Với Staff, dán vào thanh địa chỉ `/app/activity?l=<id dòng của Owner>` (id lấy từ đường dẫn khi Owner bấm dòng). | Hiện "Không tìm thấy dòng nhật ký" (không lộ nội dung). |
| 6 | Không có dòng nào để sửa/xóa. | Trang chỉ đọc: không có nút sửa/xóa. |

Nếu hỏng: ghi số bước, ảnh chụp và nội dung hiện trên màn hình.

---

## KT-009 — Tìm workspace trong bộ chuyển (FR-005-SEARCH)

Điều kiện: tài khoản thật là thành viên của ít nhất 2 workspace có tên khác nhau (ví dụ tạo thêm một workspace ở `/app/onboarding/workspace`). Chạy `pnpm --filter @flow/web dev`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập, bấm nút tên workspace ở thanh trên. | Mở danh sách có ô "Tìm workspace" ở đầu, workspace hiện tại có dấu tick và không bấm được. |
| 2 | Gõ một phần tên workspace kia, bỏ dấu và viết hoa/thường tùy ý (vd "cua hang"). | Chỉ còn workspace có tên khớp; mục "+ Tạo workspace mới" vẫn hiện. |
| 3 | Gõ chuỗi không khớp tên nào. | Hiện "Không tìm thấy workspace". |
| 4 | Xóa ô tìm kiếm rồi bấm vào workspace khác. | Chuyển workspace; tên trên thanh trên đổi. |
| 5 | Chuyển sang tiếng Anh (nút ngôn ngữ) và mở lại danh sách. | Ô hiện "Search workspaces". |

Chưa có "số việc cần xử lý" (gap `FR-005-COUNT`). Nếu hỏng: ghi số bước và ảnh chụp.

---

## Mẫu cho mục mới

```
## KT-00N — <tên tính năng> (PR #...)
Điều kiện: ...
| # | Bước | Kết quả mong đợi |   (≤ 10 bước, cả vi và en)
```

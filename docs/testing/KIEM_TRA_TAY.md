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
| KT-010 | Ẩn / Bỏ ẩn bình luận | FB-HIDE | chưa | chưa | — |
| KT-015 | Role DB riêng cho worker (`cf_worker`, ADR 011; **làm theo thứ tự: tạo role → `.env` → migrate**) | feat/worker-db-role | chưa | chưa | — |
| KT-012 | Connector Facebook thật: trả lời, ẩn/bỏ ẩn, đăng ký webhook (**cần Page thật + token**) | feat/fb-connector | có | chưa | — |
| KT-021 | Quét bù bình luận + banner webhook im lặng (**cần Page thử + `POLLING_ENABLED=true` + `POLLING-CHANNEL-LIST`**) | feat-polling-backfill | chưa | chưa | — |
| KT-016 | Worker nối connector Facebook (`FB_CONNECTOR_ENABLED`, **cần Page thử**; bước kích hoạt ở đầu KT-012) | feat/fb-connector-register | chưa | chưa | — |
| KT-014 | Kết nối Facebook (OAuth) + Kết nối lại (**cần Meta App + Page thử; cờ `FB_OAUTH_ENABLED=true`**) | feat/fb-oauth | chưa | chưa | — |
| KT-018 | Tên sản phẩm/logo/tên miền/email gửi cấu hình được (giá trị tạm) | feat-cfg-appname | chưa | chưa | — |
| KT-016 | Quét yêu cầu gửi/ẩn kẹt (job quét 60 giây; **cần migrate 0031 + worker bản mới**) | feat-send-hide-sweep | chưa | chưa | — |

---

## KT-016 — Quét bù bình luận + banner webhook im lặng (POLLING-BACKFILL, FR-023)

Điều kiện: Page thử đã kết nối (KT-014), webhook đang chạy (KT-002), worker bật `POLLING_ENABLED=true`, `POLLING-CHANNEL-LIST` đã có.
1. Trên Page thử, đăng một bình luận mới rồi **tắt webhook** (hoặc tạm đổi `META_APP_SECRET` sai ở web để webhook bị từ chối). — Mong đợi: bình luận chưa hiện ở trang Bình luận ngay.
2. Chờ > 10 phút (5 phút chờ webhook + chu kỳ quét 5 phút). — Mong đợi: bình luận xuất hiện ở trang Bình luận (do quét bù).
3. Đăng nhập bằng Owner, mở bất kỳ trang trong `/app`. — Mong đợi: banner "Webhook có thể đang bị sót tin: <tên Page>" (en: "Webhook may be dropping events: …").
4. Đăng nhập bằng Staff. — Mong đợi: KHÔNG thấy banner này.
5. Bật lại webhook, đăng bình luận mới. — Mong đợi: bình luận hiện ngay; banner biến mất sau lần tải trang kế.
6. Kiểm tra không trùng: bình luận ở bước 2 chỉ xuất hiện một lần. — Mong đợi: một dòng.
7. Chuyển ngôn ngữ vi ↔ en. — Mong đợi: banner đổi ngôn ngữ.

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

## KT-012 — Connector Facebook thật (FB-CONNECTOR-CONTRACT, ADR 010)

**Kích hoạt (KT-016):** đặt `FB_CONNECTOR_ENABLED=true` (kèm `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENC_KEYS`) cho worker rồi khởi động lại; cờ tắt (mặc định) → sổ connector rỗng, giao diện vẫn báo chưa kết nối được. Worker log `send bị nền tảng chặn (BLOCKED)` kèm id kênh khi Meta trả mã 368 (chưa tự tạm khóa kênh — gap `SEND-SUSPEND-ADMIN`). Kiểm tay chỉ làm được sau khi `SEND-SWEEP`/`HIDE-SWEEP` merge.

**Trạng thái trước KT-016:** connector mới chỉ có code + test bằng phản hồi viết tay; CHƯA đăng ký vào worker nên giao diện vẫn báo "Chưa kết nối được tới nền tảng để gửi" (đúng, xem KT-007). Mục này dành cho SAU KHI có `FB-OAUTH` + một Page thử + token thật và connector được nối vào worker (gap `FB-CONNECTOR-REGISTER`, `SEND-FIND-REPLY-BY-PARENT`). Dùng Page thử, không dùng Page khách.

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

## KT-010 — Ẩn / Bỏ ẩn bình luận (FB-HIDE, FR-044)

Điều kiện: migration 0027 đã áp lên `cf_dev` (`pnpm db:migrate`) và hàng đợi đã cài (`pnpm --filter @flow/worker queue:install`); có bình luận ở trạng thái Chờ duyệt/Mới trên một kênh `connected` (xem KT-003); chạy `pnpm --filter @flow/web dev` và `pnpm --filter @flow/worker dev`. **Chưa có connector Facebook thật** nên khi bấm Ẩn, worker báo lỗi "Chưa kết nối được tới nền tảng…" — đó là kết quả ĐÚNG ở bước này (bình luận KHÔNG chuyển sang "Đã ẩn" khi nền tảng chưa xác nhận); ẩn thật chỉ thử được sau `FB-OAUTH` + connector Facebook (bước 7–8, cần Page thử).

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở một bình luận Chờ duyệt ở trang Bình luận. | Dưới chi tiết (dưới hộp soạn trả lời) có nút **Ẩn**. |
| 2 | Bấm **Ẩn**. | Hiện "Đang ẩn bình luận trên nền tảng…" (không báo "Đã ẩn"); bấm đúp không tạo hai yêu cầu. |
| 3 | Đợi vài giây (worker chạy). | Hiện **Ẩn không thành công** + "Lý do: Chưa kết nối được tới nền tảng. Hãy thử lại sau." và nút **Thử lại**; trạng thái bình luận vẫn như cũ, không có trong tab **Đã ẩn**. |
| 4 | Bấm **Thử lại**. | Lại "Đang ẩn…" rồi cùng lỗi (chưa có connector thật). |
| 5 | Hai tài khoản: A mở bình luận (khóa), B mở cùng bình luận. | B thấy "<tên A> đang xử lý bình luận này nên bạn chưa ẩn được", không có nút. |
| 6 | Đặt kênh sang `expired` (nhờ agent) rồi mở bình luận; đổi sang **English** và thu nhỏ ~390px. | Thấy "Kênh chưa kết nối được…", không có nút; chữ đúng tiếng Anh, không tràn ngang. |
| 7 | (Sau FB-OAUTH + connector Facebook) Bấm **Ẩn** với bình luận trên Page thử. | Sau vài giây bình luận chuyển sang tab **Đã ẩn**, nút đổi thành **Bỏ ẩn**; trên Facebook bình luận bị ẩn với người ngoài. |
| 8 | (Như bước 7) Bấm **Bỏ ẩn**. | Bình luận về tab cũ (trạng thái trước khi ẩn), nút lại là **Ẩn**; trên Facebook bình luận hiện lại. Nhật ký có "đã ẩn"/"bỏ ẩn", không có nội dung bình luận. |

Nếu hỏng: ghi số bước, ảnh chụp (che tên khách) và nội dung hiện trên màn hình.

---

## KT-011 — Tự rời workspace + Nhật ký của Staff (MEMBER-LEAVE, LOG-RLS-STAFF)

Điều kiện: migration 0028 đã áp lên `cf_dev` (`pnpm db:migrate`); chạy `pnpm --filter @flow/web dev`; workspace có **hai Owner** (Owner A, Owner B) và **một Staff** đã nhận lời mời; Owner A đã bật 2FA. Dùng cửa sổ ẩn danh riêng cho mỗi người.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập **Staff**, mở bộ chuyển workspace (góc trên) và chọn **Rời workspace này** (`/app/leave`); menu chính KHÔNG có mục rời. | Trang hiện tên workspace và nút "Rời workspace". |
| 2 | Bấm "Rời workspace" (chưa xác nhận). | Hộp xác nhận mở ra kèm cảnh báo mất quyền truy cập; chưa rời. |
| 3 | Bấm "Xác nhận rời workspace". | Được chuyển về `/app`: nếu Staff còn workspace khác thì vào workspace đó, nếu không thì sang trang tạo workspace. Mở lại workspace cũ (dán đường dẫn `/app/comments`) không còn truy cập. |
| 4 | Đăng nhập **Owner A**, mở **Thành viên** và **Nhật ký**. | Staff không còn trong danh sách; Nhật ký có dòng "Thành viên tự rời workspace" do Staff thực hiện. |
| 5 | Kiểm hộp thư của Owner A và Owner B. | Cả hai nhận email "Có thành viên rời …" nêu tên Staff; Staff không nhận thư nào. |
| 6 | Owner A mở bộ chuyển workspace > **Rời workspace này**, bấm "Rời workspace" rồi xác nhận. | Rời được vì còn Owner B; Owner B nhận email báo. |
| 7 | Đăng nhập **Owner B** (giờ là Owner cuối), mở bộ chuyển workspace > **Rời workspace này**. | Trang không có nút xác nhận, chỉ giải thích phải nâng người khác lên Owner trước và có link "Mở trang Thành viên". |
| 8 | (Nhờ agent) gọi thẳng hành động rời bằng Owner B. | Báo lỗi "Bạn là Owner đang hoạt động cuối cùng…", Owner B vẫn là Owner. |
| 9 | Mời lại Staff, Staff nhận lời mời, Staff làm một hành động, rồi Owner mở **Nhật ký**; Staff mở **Nhật ký**. | Owner thấy cả dòng của Staff lẫn của mình; Staff chỉ thấy dòng của chính mình (ép ở cả cơ sở dữ liệu). |
| 10 | Đổi sang **English** và thu nhỏ ~390px, lặp bước 1–3. | Chuỗi tiếng Anh đúng, nút không vỡ bố cục. |

Nếu hỏng: ghi số bước, ảnh chụp và nội dung hiện trên màn hình.

---

## KT-013 — Staff thấy dòng hệ thống do mình yêu cầu (LOG-STAFF-SYSTEM-ROWS)

Điều kiện: migration 0029 đã áp lên `cf_dev` (`pnpm db:migrate`); chạy web + worker bản mới (`pnpm --filter @flow/web dev`, `pnpm --filter @flow/worker dev`); workspace có **một Owner** và **hai Staff** (Staff 1, Staff 2) và một kênh Facebook đã kết nối có vài bình luận. Dùng cửa sổ ẩn danh riêng cho mỗi người.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | **Staff 1** gửi một trả lời cho một bình luận và ẩn một bình luận khác; chờ worker xử lý xong. | Bình luận chuyển "đã trả lời" / "đã ẩn". |
| 2 | **Staff 2** gửi trả lời cho bình luận thứ ba. | Như trên. |
| 3 | Staff 1 mở **Nhật ký**. | Thấy các dòng "Yêu cầu trả lời", "Yêu cầu ẩn" của mình VÀ dòng hệ thống "Đã gửi trả lời"/"Đã ẩn" ghi "Hệ thống (theo yêu cầu của bạn)". Không thấy dòng nào của Staff 2. |
| 4 | Owner mở **Nhật ký**. | Thấy mọi dòng; dòng hệ thống ghi "Hệ thống (theo yêu cầu của <tên Staff>)". |
| 5 | Staff 1 lọc tác nhân "Hệ thống" (nếu có ô lọc cho Staff) hoặc mở chi tiết dòng hệ thống của mình. | Chỉ dòng của mình; chi tiết mở được. Dán đường dẫn chi tiết dòng hệ thống của Staff 2 → báo không tìm thấy. |
| 6 | Bật AI tự gửi (nếu có) để một bình luận được AI trả lời. Staff 1 mở **Nhật ký**. | Không thấy dòng "AI" tự gửi; Owner thấy. |
| 7 | Đổi sang **English**, thu nhỏ ~390px. | "System (at your request)" / "System (at the request of <name>)", không vỡ bố cục. |

Nếu hỏng: ghi số bước, ảnh chụp và nội dung hiện trên màn hình.

---

## KT-016 — Bảng kiến thức `kb_*` (KB-SCHEMA, feat/kb-schema, migration 0031)

Điều kiện: nhánh `feat/kb-schema`; máy ảo `cf` bật; `.env` đã có `DATABASE_WORKER_URL`/`TEST_DATABASE_WORKER_URL` (KT-015). Việc này chỉ có bảng, chưa có giao diện.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm db:migrate` (cf_dev). | Áp migration 0031, không lỗi (cần extension `vector` đã có sẵn ở DB dev). |
| 2 | `pnpm db:check-rls`. | 0 vi phạm; có ba bảng `cf.kb_sources`, `cf.kb_versions`, `cf.kb_chunks`. |
| 3 | `CF_LANE=b pnpm test:db`. | Xanh, gồm `kb-schema.int.test.ts`. |
| 4 | Trong `psql` vào `cf_dev`: `SELECT format_type(atttypid, atttypmod) FROM pg_attribute WHERE attrelid='cf.kb_chunks'::regclass AND attname='embedding';` | `halfvec(1024)`. |

Nếu hỏng: ghi số bước và nội dung lỗi (không dán mật khẩu).

---

## KT-015 — Role DB riêng cho worker (WORKER-DB-ROLE, ADR 011)

Điều kiện: nhánh `feat/worker-db-role`; máy ảo `cf` bật. Thứ tự BẮT BUỘC: tạo role → sinh lại `.env` → migrate.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `pnpm cf:dev add-worker-role` (máy ảo, không in mật khẩu). Chạy lại lần hai. | Cả hai lần báo "Đã đảm bảo role cf_worker…"; không lỗi (idempotent). |
| 2 | Sinh lại `.env`: `ssh cf "~/CommentFlow/infra/scripts/print-dev-env.sh" > .env`. Mở `.env` kiểm có thêm `DATABASE_WORKER_URL` và `TEST_DATABASE_WORKER_URL` (người dùng `cf_worker`). | Có hai biến mới; `env.example` có đúng tên đó. |
| 3 | `pnpm db:migrate` (cf_dev). | Áp migration 0030, không lỗi. Chạy khi CHƯA có role → dừng với thông báo "Thiếu role cf_worker…". |
| 4 | `pnpm db:check-rls`. | 0 vi phạm. |
| 5 | `CF_LANE=b pnpm test:db` (hoặc làn của bạn). | Xanh, gồm `worker-role.int.test.ts`. |
| 6 | `pnpm --filter @flow/worker dev`; mở `http://localhost:3001/health`. | Báo sẵn sàng; log không có lỗi `42501`. |
| 7 | Tắt worker, xóa `DATABASE_WORKER_URL` (hoặc đặt URL dùng `cf_app`) rồi chạy lại worker. | Worker KHÔNG khởi động, thông báo nêu tên biến `DATABASE_WORKER_URL`, không in mật khẩu. Khôi phục sau đó. |
| 8 | Thử đường nghiệp vụ: gửi webhook thử (`pnpm webhook:send`) khi worker chạy, hoặc gửi một trả lời (KT-007). | Worker xử lý như trước (job `ingest`/`send` xong). |
| 9 | Trên máy ảo, trong `psql` vào `cf_dev`: `SELECT has_function_privilege('cf_app','cf.read_channel_token(uuid)','execute'), has_function_privilege('cf_worker','cf.read_channel_token(uuid)','execute');` | `f` và `t`. |

Nếu hỏng: ghi số bước, ảnh chụp và nội dung hiện trên màn hình.

---

## KT-017 — Lưu ngôn ngữ theo người dùng (AUTH-LANG-PREF, FR-119)

Điều kiện: nhánh `feat-auth-lang-pref`; máy ảo bật; một tài khoản đã đăng nhập.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở `/app/security` (mục Bảo mật trong điều hướng). | Có thẻ "Ngôn ngữ giao diện" với hai nút Tiếng Việt / English; nút ngôn ngữ đang dùng bị mờ. |
| 2 | Bấm "English". | Trang đổi sang tiếng Anh ngay (tiêu đề thẻ: "Interface language"). |
| 3 | Trong `psql` (máy ảo, `cf_dev`): `SELECT locale FROM core.users WHERE email = '<email của bạn>';` | `en`. |
| 4 | Đăng xuất, xóa cookie `NEXT_LOCALE` của trang, đăng nhập lại. | Giao diện vẫn tiếng Anh (lấy từ tài khoản). |
| 5 | Bấm "Tiếng Việt" ở thanh trên (hoặc ở Cài đặt). | Giao diện tiếng Việt; bước 3 cho `vi`. |
| 6 | Đăng xuất, ở trang đăng nhập bấm đổi ngôn ngữ. | Giao diện đổi (cookie), không lỗi; DB không đổi vì chưa có phiên. |

Nếu hỏng: ghi số bước, ảnh chụp.

---

## KT-016 — Quét yêu cầu gửi/ẩn kẹt (SEND-SWEEP + HIDE-SWEEP, ADR 008/009)

Điều kiện: nhánh `feat-send-hide-sweep`; máy ảo `cf` bật; đã `pnpm db:migrate` (0031) và chạy worker bản mới. Sổ connector của worker còn RỖNG (chưa có connector thật) nên bước gửi/ẩn kết thúc `connector_unavailable` — đủ để thấy quét hoạt động.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm db:migrate` rồi `pnpm db:check-rls`. | Áp 0031; 0 vi phạm. |
| 2 | Chạy worker (`pnpm --filter @flow/worker dev`) và để mở. | Sẵn sàng; không lỗi `42501` về `list_stuck_outbox`. |
| 3 | Trên máy ảo, `psql` vào `cf_dev`: tạo yêu cầu kẹt bằng cách sửa một yêu cầu `queued` mới: `UPDATE cf.comment_replies SET updated_at = now() - interval '10 minutes' WHERE id = '<id yêu cầu queued>';` (chỉ dữ liệu thử). | — |
| 4 | Chờ ≤ 60 giây rồi xem lại dòng đó. | Yêu cầu không còn `queued` (hiện `failed`/`connector_unavailable` vì chưa có connector thật); bình luận hiện lỗi gửi + nút Thử lại. Log worker có dòng "đã quét yêu cầu gửi/ẩn kẹt", không có nội dung bình luận. |
| 5 | Lặp bước 3–4 với một yêu cầu ẩn (`cf.comment_hides`). | Tương tự: hết `queued`, ghi `failed`. |
| 6 | Tạo yêu cầu `queued` mới (không sửa giờ), chờ 60 giây. | KHÔNG bị quét (còn mới < 5 phút) — vẫn do job thường xử lý. |
| 7 | Trên máy ảo, `psql` bằng web (`cf_app`): `SELECT * FROM cf.list_stuck_outbox('reply', 300, 150, 10);` | Lỗi `permission denied` (chỉ `cf_worker` gọi được). |

Nếu hỏng: ghi số bước, ảnh chụp và nội dung hiện trên màn hình.

---

## KT-014 — Kết nối Facebook (OAuth) + Kết nối lại (FB-OAUTH, feat/fb-oauth)

Điều kiện: làm xong `docs/CAN_BAN_CUNG_CAP.md` mục 1 + mục "Meta OAuth + Page thử" (Meta App dev, Page thử, `.env.local` có `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URL`, `TOKEN_ENC_KEYS`, **`FB_OAUTH_ENABLED=true`**; tùy chọn `CHANNELS_LIMIT_DEFAULT`, `FB_LOGIN_CONFIG_ID`); khởi động lại web. Đăng nhập bằng **Owner** (tài khoản Facebook của bạn là Admin/Tester của App và quản lý Page thử). Có thêm một tài khoản **Staff**.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Staff mở `/app/channels`. | 404 (Staff không thấy trang; không có mục "Kênh" trong menu). |
| 2 | Owner mở menu **Cài đặt → Kênh**. | Thấy "Chưa có kênh nào" và nút **Kết nối Facebook**. |
| 3 | Bấm **Kết nối Facebook**, đăng nhập Facebook và cấp quyền. | Quay về `/app/channels` với bước **Chọn Page** liệt kê Page bạn quản lý; Page thiếu quyền quản lý/kiểm duyệt bị mờ. |
| 4 | Chọn đúng một Page thử, bấm **Kết nối các Page đã chọn**. | Dải xanh "Đã kết nối 1 Page"; Page xuất hiện trong danh sách trạng thái **Đang kết nối**, không có nhãn "Chưa nhận bình luận mới". |
| 5 | Bình luận vào một bài của Page thử bằng tài khoản khác; đợi vài giây. | Bình luận hiện ở trang **Bình luận** (webhook đã đăng ký đúng Page). |
| 6 | Với `CHANNELS_LIMIT_DEFAULT=1`, bấm **Kết nối Facebook** lần nữa và chọn thêm một Page khác. | Dải vàng "Vượt số kênh tối đa của gói hiện tại"; không có kênh mới. Chọn lại chính Page đã kết nối (kết nối lại) thì vẫn được. |
| 7 | Trong Facebook → Cài đặt → Ứng dụng, gỡ App khỏi tài khoản, rồi để hệ thống gặp lỗi token (hoặc đặt tay trạng thái kênh `expired` bằng công cụ DB của bạn). Tải lại trang bất kỳ. | Banner "Kênh hết hạn kết nối" có nút **Kết nối lại** cho Owner (Staff không có nút). |
| 8 | Bấm **Kết nối lại**, cấp quyền lại, chọn Page. | Kênh trở lại **Đang kết nối**; banner biến mất sau lần tải kế tiếp. |
| 9 | Bấm **Kết nối Facebook**, ở màn Meta bấm **Hủy**. | Về `/app/channels` với dải xanh nhạt "Bạn đã hủy việc cấp quyền"; không có gì đổi. |
| 10 | Bỏ `FB_OAUTH_ENABLED` (hoặc đặt `false`), khởi động lại web, mở `/app/channels` và `/api/channels/facebook/start`. | Trang hiện "chưa được bật", không có nút; đường `start` trả 404. Đổi sang **English** + ~390px: chữ và bố cục đúng. |

Nếu hỏng: ghi số bước, ảnh chụp, và dòng nhật ký web (chỉ mã lỗi, không có token).

---

## KT-020 — Đổi mật khẩu (AUTH-CHANGE-PW-UI, feat-auth-change-pw-ui)

Điều kiện: đăng nhập một tài khoản thử; mở `/app/security` ở **hai trình duyệt** (A và B, cùng tài khoản). Có thể đặt `PWNED_CHECK=on` để thử bước 4 (cần mạng).

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Ở A, mục **Đổi mật khẩu**: điền mật khẩu hiện tại SAI + mật khẩu mới hợp lệ. | Dải đỏ "Mật khẩu chưa đúng."; vẫn đăng nhập. |
| 2 | Mật khẩu mới ngắn (< 10 ký tự). | Dải đỏ "Mật khẩu cần tối thiểu 10 ký tự." |
| 3 | Mật khẩu mới trùng mật khẩu hiện tại; rồi ô nhập lại không khớp. | "Mật khẩu mới phải khác…"; "Hai mật khẩu chưa giống nhau…". |
| 4 | Mật khẩu mới là `qwertyuiop` (và một mật khẩu từng lộ, khi bật HIBP). | "quá phổ biến" / "đã xuất hiện trong các vụ lộ dữ liệu". |
| 5 | Sai mật khẩu hiện tại 5 lần liên tiếp, lần 6. | Thông báo "thử quá nhiều lần, đợi khoảng N phút". |
| 6 | Đợi hết hạn (hoặc dùng tài khoản khác), nhập đúng mật khẩu hiện tại + mật khẩu mới mạnh. | Chuyển về `/login`. |
| 7 | Ở B tải lại trang. | B cũng bị đưa về `/login` (mọi phiên đã bị xóa). |
| 8 | Đăng nhập bằng mật khẩu CŨ, rồi bằng mật khẩu MỚI. | Cũ bị từ chối; mới vào được. |
| 9 | Đổi sang **English** + ~390px, mở lại thẻ. | Chữ tiếng Anh đúng, ô nhập không tràn. |

Nếu hỏng: ghi số bước, ảnh chụp, và dòng nhật ký web (không dán mật khẩu).

---

## KT-019 — Chỉ mục Nhật ký của Staff (ACTION-LOGS-ACTOR-INDEX, migration 0032)

Điều kiện: nhánh `feat-action-logs-actor-index`; máy ảo `cf` bật; đã có `.env`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm db:migrate` (cf_dev). | Áp migration 0032, không lỗi; chạy lại lần hai cũng không lỗi. |
| 2 | Trên máy ảo, `psql` vào `cf_dev`: `\d core.action_logs`. | Thấy hai chỉ mục `action_logs_ws_actor_created_idx` và `action_logs_ws_on_behalf_created_idx` (có `WHERE`). |
| 3 | `pnpm db:check-rls`. | 0 vi phạm. |
| 4 | Đăng nhập Staff, mở **Nhật ký**. | Vẫn chỉ thấy dòng của mình + dòng hệ thống do mình yêu cầu (hành vi không đổi). |

Nếu hỏng: ghi số bước và nội dung hiện trên màn hình.

---

## KT-018 — Tên sản phẩm, logo, tên miền, email gửi cấu hình được (CFG-APPNAME, FR-125)

Điều kiện: web dev chạy; máy ảo (Mailpit) bật. Đặt trong `.env.local` (tên tạm, không cần chốt Q6): `APP_NAME=Tên Thử`, `APP_LOGO_URL=https://picsum.photos/64` (hoặc để trống), `APP_DOMAIN=thu.example.com`; xóa dòng `SMTP_FROM` để thử địa chỉ gửi tự dựng. Khởi động lại web sau mỗi lần đổi biến.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở `/login`, `/register`, `/app` (đã đăng nhập) ở cả `vi` và `en`. | Tên "Tên Thử" ở đầu trang, tab trình duyệt và chân trang ("© năm Tên Thử"); không còn chữ "CommentFlow AI". |
| 2 | Có `APP_LOGO_URL` → nhìn đầu trang; bỏ biến rồi khởi động lại. | Có biến: ảnh logo nằm trong ô vuông. Không có: biểu tượng tin nhắn mặc định. |
| 3 | Đăng ký tài khoản mới, mở thư xác minh trong Mailpit. | Chủ đề, nội dung, chân thư mang "Tên Thử"; người gửi `Tên Thử <no-reply@thu.example.com>`. |
| 4 | Bật 2FA (`/app/security`), nhìn mục trong ứng dụng xác thực. | Tên nhà phát hành là "Tên Thử". |
| 5 | Đặt `APP_DOMAIN=https://sai` rồi khởi động web. | Web không chạy, lỗi chỉ nêu tên biến `APP_DOMAIN` (không nêu giá trị). |

Nếu hỏng: ghi số bước và ảnh chụp.

---

## KT-016 — Trang Cài đặt (SETTINGS-PAGE, feat-settings-page)

Điều kiện: đã đăng nhập, có workspace. Làm bằng cả Owner và Staff.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở menu **Cài đặt** (cả Owner và Staff). | Vào `/app/settings`; không còn mục "Bảo mật" riêng; mục Cài đặt được tô đậm. |
| 2 | Xem trang. | Có thẻ xác thực 2 bước, danh sách phiên đăng nhập, thẻ ngôn ngữ. |
| 3 | Đăng nhập thêm trên trình duyệt khác rồi tải lại trang. | Thấy 2 phiên; phiên hiện tại có nhãn "Hiện tại", không có nút đăng xuất. |
| 4 | Bấm **Đăng xuất** ở phiên kia. | Phiên kia biến mất; trình duyệt kia bị đăng xuất. |
| 5 | Owner chưa bật 2FA mở `/app/settings`. | Bị chuyển tới `/app/security` có biểu ngữ bắt buộc; bật được 2FA ở đó. |
| 6 | Ở thẻ ngôn ngữ bấm **English**. | Toàn giao diện đổi sang tiếng Anh ngay; nút English khóa; lặp lại với Tiếng Việt. |

Nếu hỏng: ghi số bước và ảnh chụp.

---

## Mẫu cho mục mới

```
## KT-016 — Bình luận trên mobile 390px (INBOX-MOBILE, feat-inbox-mobile)
Điều kiện: workspace có ≥ 1 bình luận; trình duyệt giả lập 390px (DevTools).
| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở `/app/comments` ở 390px | Chỉ thấy tab (cuộn ngang) + bộ lọc + danh sách; không có khung chi tiết; không cuộn ngang cả trang |
| 2 | Chạm một bình luận | Chi tiết toàn màn hình, có "← Quay lại danh sách" (en: "← Back to list") |
| 3 | Chạm Quay lại | Về danh sách, tab/lọc/tìm giữ nguyên |
| 4 | Nút Back của trình duyệt ở bước 2 | Cũng về danh sách |
| 5 | Các tab, ô lọc, nút Quay lại | Chạm được dễ (cao ≥ 44px); ô lọc rộng hết dòng |
| 6 | Nới cửa sổ ≥ 900px | Bố cục desktop như cũ; không thấy nút Quay lại |
| 7 | Lặp bước 1–3 ở tiếng Anh | Chuỗi đúng ngôn ngữ |

## KT-00N — <tên tính năng> (PR #...)
Điều kiện: ...
| # | Bước | Kết quả mong đợi |   (≤ 10 bước, cả vi và en)
```

## KT-021 — LISTEN feature flag tự nối lại (FLAGS-RECONNECT, feat-flags-reconnect)
Điều kiện: staging, worker/web đang chạy, truy cập được Postgres staging (máy phụ).
| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Trên máy phụ: pg_terminate_backend cho kết nối LISTEN flags_changed của tiến trình | Log có cảnh báo mất kết nối (nếu đã nối onListenEvent); tiến trình vẫn chạy |
| 2 | Chờ ≤ 2 giây | Có kết nối LISTEN mới trong pg_stat_activity; cảnh báo "đã nối lại" |
| 3 | Đổi một flag ở DB | Tiến trình thấy giá trị mới ngay, không phải đợi 30 giây |
| 4 | Tạm chặn cổng DB 70 giây rồi mở lại | Khoảng cách các lần thử tăng dần tới 60 giây; sau khi mở lại tự nối lại |

## KT-POSTS-LIST — Danh sách bài viết (POSTS-LIST, feat-posts-list)
Điều kiện: staging có ít nhất 1 kênh với vài bài (sau khi webhook/polling nhận bình luận); đăng nhập Owner và Staff.
| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở menu "Bài viết" (`/app/posts`) | Thấy danh sách bài, tổng số, số bình luận và số chờ xử lý; bài chưa có nội dung hiện mã bài |
| 2 | Lọc nền tảng / kênh / loại bài, bấm Áp dụng | Danh sách và tổng số thu hẹp đúng; "Xóa bộ lọc" trả về tất cả |
| 3 | Tìm "váy" (không dấu: "vay") và một mã bài | Khớp không phân biệt dấu/hoa thường; ký tự % và _ không làm khớp lung tung |
| 4 | Đổi sắp xếp "Mới đăng nhất"; sang trang sau/trước | Thứ tự đúng; trang cuối ít bài; URL giữ bộ lọc |
| 5 | Đổi ngôn ngữ sang English | Mọi chữ trên trang đổi sang tiếng Anh |
| 6 | Đăng nhập tài khoản thuộc workspace khác | Không thấy bài của workspace này |

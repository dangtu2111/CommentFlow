# Kế hoạch `feat/post-publishing` — Backend Biên tập bài viết + Lịch đăng (lưu nháp, lên lịch, đăng Facebook)

Mã gap matrix: `POST-PUBLISHING` (mới) · Spec: chưa có mục riêng (xem "Đề xuất thay đổi") · Giao diện: `feat/composer-calendar-ui` (#352), Q-CMP1.

**Tóm tắt:** Nối chức năng cho hai trang mới: Owner **lưu bản nháp**, **lên lịch** hoặc **đăng ngay** một bài chữ lên Fanpage Facebook; Lịch hiện thêm bài nháp/đã lên lịch/lỗi; có hủy lịch và xóa nháp. Worker quét mỗi 20 giây, đăng bài đến hạn bằng token Page đã lưu (`POST /{page-id}/feed`). Đây là hành động HƯỚNG RA NGOÀI nên làm theo nguyên tắc **tối đa một lần** (không bao giờ đăng trùng), **chỉ đăng khi Owner chủ động bấm** (AI không tự viết hay tự đăng), tôn trọng **Dừng khẩn cấp**, và **cờ `FB_PUBLISH_ENABLED` mặc định TẮT**.

## Điểm chưa rõ

Không có. Quyết định tự chọn (khuyến nghị an toàn, đảo ngược được; ghi ở `docs/plans/quyet-dinh/qpub1.md`):
1. Worker tự canh giờ (quét 20 giây) thay vì dùng lịch gốc của Facebook: kiểm soát được hủy lịch/dừng khẩn cấp; đổi lại cần worker chạy.
2. Giai đoạn này CHỈ Facebook và CHỈ chữ (chưa ảnh/video/liên kết/gắn sản phẩm/Instagram/TikTok).
3. CHỈ Owner. Cờ `FB_PUBLISH_ENABLED=true` bật ở cả web và worker; tắt → vẫn lưu nháp và lên lịch được nhưng "Đăng ngay"/"Lên lịch" vô hiệu kèm lý do, và worker không đăng.
4. Lỗi không rõ kết quả (mạng đứt sau khi gửi) → trạng thái `unknown`, KHÔNG tự thử lại (tránh đăng trùng); Owner kiểm trên Facebook rồi tự xử lý. Chỉ lỗi chắc chắn chưa đăng (giới hạn tốc độ) mới thử lại, tối đa 3 lần.
5. Cần quyền `pages_manage_posts` trong `channels.scopes`; thiếu → mục tiêu đánh dấu `failed/missing_permission`. **Không đổi OAuth scope** ở nhánh này (thêm scope mà app Meta chưa có sẽ làm hỏng đăng nhập Facebook): cách cấp quyền ghi vào `docs/can-ban-cung-cap.d/`, việc xin quyền qua đăng nhập là PR riêng khi chủ dự án chốt.
6. Lên lịch cách hiện tại ≥ 2 phút và ≤ 90 ngày; độ dài 1–63.206 ký tự (nháp được trống).

## Tiêu chí nghiệm thu

1. Owner lưu nháp/sửa nháp/lên lịch/hủy lịch/xóa nháp/đăng ngay qua hàm DB; Staff và người lạ bị từ chối (42501); workspace khác không thấy/không sửa được — test tích hợp.
2. Không lên lịch được khi: thiếu nội dung, quá dài, giờ ngoài khoảng, kênh không thuộc workspace/không `connected`/không phải Facebook, bài đã đăng/đang đăng — test tích hợp.
3. Worker nhận mục tiêu đến hạn đúng MỘT lần (hai worker chạy song song không nhận trùng), bỏ qua workspace đang dừng khẩn cấp, ghi kết quả `published` (kèm id bài Facebook) / `failed` (kèm mã lỗi, không kèm nội dung) / `unknown` — test tích hợp + unit.
4. Mục tiêu `publishing` quá 15 phút → `unknown`, không bao giờ tự đăng lại — test.
5. Connector `publishPost`: chỉ POST, token trong thân yêu cầu, trả id; thân sai/thiếu id → `UNKNOWN` — test connector.
6. Cờ tắt → worker không đăng, web không cho "Đăng ngay"/"Lên lịch" — test.
7. Giao diện: nút hoạt động đúng trạng thái; Lịch hiện nháp/đã lên lịch/lỗi/không rõ; khung chi tiết có Hủy lịch/Xóa/Sửa — test render + chụp trang thật.
8. Nhật ký `action_logs` cho mọi thay đổi (không kèm nội dung bài).

## File sẽ đọc

`apps/worker/src/main.ts` + `jobs/pipeline-sweep.ts` (khuôn quét), `jobs/send.ts` (mẫu thuê/tối đa một lần), `packages/connectors/src/facebook/connector.ts` (`reply`, `call`), migration 0020/0081 (mẫu DEFINER và hàm cho worker), `apps/web/src/app/app/(guarded)/composer|calendar`, `server/post-calendar.ts`.

## File sẽ sửa / tạo

- `packages/db/migrations/0090_publish_posts.sql` (+ journal), `packages/db/src/publish-posts.ts` (+ test tích hợp), `runtime.ts`/`index`.
- `packages/connectors/src/facebook/connector.ts` (+ `types`, test) — `publishPost`.
- `apps/worker/src/jobs/publish-sweep.ts` (+ test), `main.ts`, `config`.
- `apps/web/src/server/publish-posts.ts`, `app/app/(guarded)/composer/actions.ts`, `components/composer/*`, `components/calendar/*`, `lib/publish-form.ts` (Zod) + test, i18n.
- Tài liệu: `docs/can-ban-cung-cap.d/post-publishing.md`, `docs/codemap.d/…`, kiểm tay `KT-PUB`.

## Migration

`0090` — **chỉ thêm** bảng `cf.publish_posts`, `cf.publish_post_targets` + RLS (chỉ Owner/hệ thống đọc; không ghi trực tiếp) + hàm DEFINER. Đường lùi: `DROP FUNCTION` các hàm, `DROP TABLE cf.publish_post_targets, cf.publish_posts` (mất nháp/lịch; bài đã đăng trên Facebook không bị ảnh hưởng).

## Test viết trước

Quy tắc: hàm DB (quyền, kiểm tra đầu vào, tối đa một lần, thuê hết hạn, dừng khẩn cấp), connector, job quét, form Zod.

## Lệnh test phạm vi hẹp

`cd packages/db && pnpm exec vitest run --config vitest.int.config.ts tests/publish-posts.int.test.ts`; `pnpm --filter @flow/connectors exec vitest run src/facebook`; `pnpm --filter @flow/worker exec vitest run src/jobs/publish-sweep.test.ts`; `pnpm --filter @flow/web exec vitest run src/lib/publish-form.test.ts src/components/composer src/components/calendar`.

## Cần kiểm chứng độc lập không?

**Có** (hành động hướng ra ngoài + token Page + migration + cổng dừng khẩn cấp). Phiên tự kiểm theo `docs/workflows/verify.md` (A + B), gắn nhãn "tự kiểm", không tự merge.

## Rủi ro / câu hỏi cho chủ dự án

- Cần quyền Meta `pages_manage_posts` (App Review khi bán cho khách thật) và tuân thủ chính sách Meta về nội dung quảng cáo.
- Đăng sai nội dung là rủi ro thật: nên thử trên Page thử trước khi bật cờ cho khách.
- Nếu worker tắt lâu, bài lên lịch sẽ trễ (vẫn đăng khi worker chạy lại, trừ khi đã quá hạn dài — chưa có giới hạn "quá hạn thì bỏ"; ghi nhận).

## Đề xuất thay đổi

Thêm FR/US "Biên tập & lịch đăng" vào `docs/` khi chủ dự án chốt phạm vi.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking (không có thư viện mới)
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — `publish_posts`/`publish_post_targets`: SELECT Owner/hệ thống; GHI chỉ qua hàm DEFINER (Owner `withActor`; worker `withJob`/`withSystem`)

## Trạng thái duyệt

**Đã duyệt** (chủ dự án yêu cầu làm backend hai trang, 12/11/2026; các quyết định tự chọn theo quy tắc hỏi).

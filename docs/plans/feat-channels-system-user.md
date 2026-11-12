# Kế hoạch `feat/channels-system-user` — Kết nối Page thuộc Business bằng token System User

Mã gap matrix: `CHANNELS-SYSTEM-USER` (mới) · Spec: `docs/09_System_Architecture.md` (kênh/token), ADR 013 (giao diện).

**Tóm tắt:** Page thuộc Business Portfolio không hiện ở `me/accounts` khi đăng nhập Facebook bằng tài khoản cá nhân (đã đo trên dữ liệu thật: Meta xác nhận cấp 1 Page nhưng từ chối trả token Page). Cách khắc phục không cần Advanced Access/Business Verification: chủ Business tạo **System User** (người dùng hệ thống của Business), gán Page cho nó, tạo token rồi dán vào CommentFlow. Hệ thống dùng token đó để liệt kê Page và lấy token từng Page, sau đó đi qua đúng đường kết nối hiện có. Rủi ro: chạm xử lý token nền tảng (diện nhạy cảm), nên cần kiểm chéo trước khi merge.

## Điểm chưa rõ

Không có. Quyết định của chủ dự án (12/11/2026):
1. **LƯU token System User** (mã hóa), để "Kết nối lại" và đồng bộ Page không phải dán lại. Thiết kế theo mẫu `cf.shopify_stores` (migration 0064): bảng cấp workspace `cf.fb_system_connections` (một dòng/workspace), cột `token_enc` + `key_version` mã hóa ở tầng ứng dụng (AES-256-GCM, `TOKEN_ENC_KEYS`, AAD có `workspace_id`), `cf_app` KHÔNG có quyền cột ciphertext; ghi/đọc/xóa qua hàm riêng chỉ Owner; có nút "Ngắt kết nối System User" xóa ciphertext.
2. Giao diện: khối thu gọn trong modal chọn Page, chỉ Owner.
3. Dùng lại `FB_OAUTH_ENABLED`/`FB_CONNECTOR_ENABLED`, không thêm biến môi trường.
4. Chỉ Facebook Page, không Instagram.
5. Làm sau khi #347 merge, nhánh mới từ `main`.

## Tiêu chí nghiệm thu

0. Token System User được lưu mã hóa, không bao giờ trả về trình duyệt; nút ngắt xóa ciphertext; `cf_app` không SELECT được `token_enc` — test tích hợp (`pnpm test:db`) + `pnpm db:check-rls`.
1. Dán token System User hợp lệ → modal liệt kê đúng các Page được gán, đánh dấu Page đã kết nối/không đủ quyền — kiểm bằng: test `listConnectablePages` với token giả qua tham số.
2. Token bị Meta từ chối (hết hiệu lực/sai app) → thông báo lỗi rõ, không lộ token, không lưu gì xuống DB — test.
3. Token không xuất hiện ở log, cookie, URL, HTML trả về, bảng nào trong DB — test quét đầu ra + rà diff.
4. Kết nối Page thành công → kênh + token Page mã hóa (AAD `workspace_id`+`channel_id`) + webhook đăng ký như đường OAuth — test tích hợp dùng lại `connectFacebookPages`.
5. Chỉ Owner thấy và dùng được; Staff nhận 404/403 — test.
6. Giới hạn số kênh của gói vẫn áp dụng — test.
7. Thủ công: Page "KIM TAM" thuộc Business hiện trong danh sách và kết nối được — bước kiểm tay ghi vào `docs/testing/kiem-tra-tay.d/`.

## File sẽ đọc

- `apps/web/src/server/fb-connect.ts` (đã đọc: `listConnectablePages`, `connectFacebookPages`)
- `apps/web/src/server/fb-connect-runtime.ts` (cách dựng client/store)
- `apps/web/src/app/app/(guarded)/channels/actions.ts` (Server Action hiện có)
- `apps/web/src/components/settings/fb-page-select-modal.tsx` (modal)
- `packages/connectors/src/facebook/oauth.ts` (`listPages`)

## File sẽ sửa / tạo

- `apps/web/src/server/fb-connect.ts` — cho phép nguồn token là System User (không đổi logic kết nối).
- `apps/web/src/app/app/(guarded)/channels/actions.ts` — action nhận token dán, kiểm tra Owner + Zod, trả danh sách Page.
- `fb-page-select-modal.tsx` + i18n `vi/en` — khối dán token.
- test tương ứng; `docs/can-ban-cung-cap.d/` — hướng dẫn tạo System User cho chủ Business.

## Migration

`00NN_fb_system_connections.sql` — **chỉ thêm** bảng `cf.fb_system_connections` (workspace_id PK, token_enc, key_version, created_by, created_at) + RLS theo workspace, đọc cột không bí mật cho Owner, hàm DEFINER `save/read/clear`. Đường lùi: `DROP TABLE cf.fb_system_connections` + `DROP FUNCTION` các hàm (bảng mới chưa có dữ liệu cũ). Diff migration + token ⇒ vẫn DỪNG chờ kiểm chéo, không tự merge.

## Test viết trước

Quy tắc xử lý token: không lưu/không log token; lỗi Meta ánh xạ thành mã lỗi; Owner-only.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/server/fb-connect` và `pnpm --filter @flow/connectors exec vitest run src/facebook`.

## Cần kiểm chứng độc lập không?

**Có** (xử lý token nền tảng). Phiên chính tự kiểm theo `docs/workflows/verify.md`, gắn nhãn "tự kiểm", không tự merge.

## Rủi ro / câu hỏi cho chủ dự án

- Token System User không hết hạn và quyền rộng: người dùng phải hiểu rủi ro khi dán; giao diện nhắc chỉ tạo token với đúng quyền `pages_*`.
- Page thuộc Business chỉ hiện nếu System User được gán Page với quyền quản lý nội dung.

## Đề xuất thay đổi

Thêm mục "Kết nối bằng System User" vào docs/09 sau khi duyệt.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking (không có thư viện mới)
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 12/11/2026). Bắt đầu code sau khi #347 merge; nhánh nhạy cảm (token + migration) nên chờ kiểm chéo trước khi merge.

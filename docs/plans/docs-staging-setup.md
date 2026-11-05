# Kế hoạch `docs/staging-setup` — Hướng dẫn dựng staging + script sinh bí mật

Mã gap matrix: `STAGING-SETUP-DOC` (con của `STAGING-DEPLOY`) · Spec: `docs/15_Deployment_Architecture.md` §2, §5; khớp PR #37 (`chore/h5-staging-prep`).

**Tóm tắt:** viết `docs/STAGING_SETUP.md` dẫn chủ dự án từng bước (runner, file bí mật, Cloudflare, biến GitHub, kiểm sau deploy), kèm script `infra/scripts/gen-staging-env.sh` sinh bí mật ngẫu nhiên ngay trên máy ảo. Chỉ tài liệu + một script shell; không migration, không logic nghiệp vụ. Rủi ro: script xử lý bí mật (không in ra, quyền 600, không ghi đè); agent không chạy nó. Phải merge sau PR #37.

## Điểm chưa rõ

Không có (các điểm cần chủ dự án chọn nằm ở mục "Cần bạn quyết định" của tài liệu).

## Tiêu chí nghiệm thu

1. Tài liệu có tóm tắt, bảng việc cần làm, mục "Cần bạn quyết định", các bước A–F mỗi bước có lệnh kiểm + kết quả mong đợi — kiểm bằng: đọc `docs/STAGING_SETUP.md`.
2. Script sinh `TOKEN_ENC_KEYS` đúng dạng `v1:<64 hex>`, không in bí mật, quyền 600, không ghi đè khi đã có file, từ chối ghi trong repo git — kiểm bằng: `bash -n` + rà mã (agent không chạy script); script tự kiểm định dạng trước khi đặt file.
3. Tên biến khớp `infra/env.cf-staging.example` + biến bắt buộc `${X:?}` của compose — kiểm bằng: so sánh `grep` tên biến.
4. `pnpm lint`, `pnpm check:plans` xanh.

## File sẽ đọc

`docs/workflows/feature.md`, `finish.md`; `docs/CAN_BAN_CUNG_CAP.md` §1.3; `env.example`, `infra/env.cf-dev.example`, `infra/docker-compose.yml` (chỉ tên biến); từ `origin/chore/h5-staging-prep`: compose staging, `env.cf-staging.example`, `deploy-staging.yml`, `H5-CHECKLIST.md`.

## File sẽ sửa / tạo

Sửa thêm (theo trả lời chủ dự án): `docs/CAN_BAN_CUNG_CAP.md` §1.3 mục 2 và 5. Tạo: `docs/STAGING_SETUP.md`, `infra/scripts/gen-staging-env.sh`, plan này. Sửa: `docs/gap-matrix.md`, `docs/codemap.md`.

## Migration

Không có.

## Test viết trước

Không có logic nghiệp vụ.

## Lệnh test phạm vi hẹp

`bash -n infra/scripts/gen-staging-env.sh`; `pnpm lint`; `pnpm check:plans`.

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/token trong code; script chỉ sinh khóa ngẫu nhiên). Chủ dự án nên đọc script trước khi chạy.

## Rủi ro / câu hỏi cho chủ dự án

Xem mục "Cần bạn quyết định" trong `docs/STAGING_SETUP.md`. Mục E (migrate staging) ghi "sắp có".

## Đề xuất thay đổi

Workflow `deploy-staging.yml` (PR #37) chưa có `--profile tunnel` — đề xuất thêm ở nhánh sau khi có tên miền.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (chủ dự án giao việc trực tiếp).

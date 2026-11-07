# 015 — CI lọc theo đường dẫn thay đổi

Trạng thái: chủ dự án duyệt 07/11/2026. Phạm vi: `.github/workflows/ci.yml`, `scripts/ci-changes.mjs`.

## Vì sao
Mọi PR đều chạy cả 5 job (5–10 phút/lần), kể cả PR chỉ sửa tài liệu hoặc DB. E2E (Playwright) là job nặng nhất và vô ích với PR chỉ sửa docs.

## Cách làm
Job `changes` (không bắt buộc) chạy `node scripts/ci-changes.mjs`, so `git diff --name-only origin/<base>...HEAD` rồi xuất `database`, `e2e`, `python` (và `node=true`). Ba job nặng có `needs: changes` + `if: needs.changes.outputs.<x> == 'true'`. **Node và gitleaks luôn chạy.** Tên 5 job giữ nguyên (check bắt buộc của `main`).

## Bảng luật (hàm thuần `decideJobs`, có test)
| Đường dẫn đổi | database | e2e | python |
|---|---|---|---|
| `docs/**`, `design/**`, `*.md` | – | – | – |
| `packages/db/{migrations,tests,src}/**` | ✔ | – | – |
| `apps/web/src/server/**` | ✔ | ✔ | – |
| `apps/web/**` (còn lại), `e2e/**` | – | ✔ | – |
| `packages/saas-core/**`, `packages/shared/**` | ✔ | ✔ | – |
| `apps/worker/**` | ✔ | – | – |
| `services/ml/**` | – | – | ✔ |
| File chung: `.github/**`, `package.json` (gốc), `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig*.json`, `biome.json`, `scripts/**`, `infra/**`, `.nvmrc` | ✔ | ✔ | ✔ |
| Đường dẫn lạ (vd `packages/ai/**`), danh sách rỗng | ✔ | ✔ | ✔ |

Nhiều file → hợp các luật. Push vào `main` và PR có nhãn `ci-full` → luôn chạy đủ. Lỗi lấy diff → chạy đủ (bước lọc không bao giờ làm job nặng bị bỏ qua vì lỗi của chính nó).

## Đánh đổi
- PR chỉ sửa DB không chạy E2E; PR chỉ sửa web không chạy test DB. Được bù bằng chạy đủ khi vào `main` (lưới an toàn sau merge): lỗi lọt sẽ hiện ở `main`, không ở PR.
- Job bị bỏ qua bằng `if:` cấp job được GitHub tính là thành công cho check bắt buộc — đã kiểm bằng PR thật (xem mô tả PR kiểm chứng).
- Thêm `labeled` vào các sự kiện PR để nhãn `ci-full` kích hoạt lại CI (mọi nhãn khác cũng chạy lại một lần).

## Ép chạy đủ / tắt
- Ép: gắn nhãn `ci-full` vào PR.
- Tắt hẳn: sửa `scripts/ci-changes.mjs` cho `decideJobs` luôn trả đủ, hoặc xóa dòng `needs`/`if` của ba job (job `changes` vô hại).
- Nếu check bắt buộc không được tính thành công khi skipped: chuyển sang job luôn chạy, bước nặng bỏ qua bằng `if:` cấp bước.
- Đã kiểm chứng 07/11/2026 bằng PR thử chỉ sửa tài liệu: xem kết quả check ở PR `chore/ci-skip-probe`.

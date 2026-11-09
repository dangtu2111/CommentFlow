# Kế hoạch `feat/kb-policies-remove-legacy` — Bỏ phần "Chính sách dạng văn bản" khỏi trang Chính sách

## Việc

Mã gap matrix: `KB-POLICIES-STRUCTURED-UI` · ADR 017. Chủ dự án chốt 09/11/2026: trang Chính sách chỉ còn phần có cấu trúc.

**Tóm tắt (2–3 câu dễ hiểu):** Trang `/app/kb/policies` bỏ khối nhập chính sách văn bản (thêm/sửa/xóa theo loại và ngôn ngữ) và ba Server Action tương ứng. Dữ liệu chính sách văn bản đã có và chính sách nạp từ Shopify vẫn nằm trong cơ sở dữ liệu, vẫn nuôi bộ tìm kiếm tri thức và là nguồn đề xuất giá trị cho trang có cấu trúc. Rủi ro: Owner không còn chỗ nhập tay chính sách văn bản mới, trong khi cờ `cf.ai.fact_slots` còn tắt thì AI vẫn trả lời từ văn bản — shop chưa nối Shopify nên nhập giá trị có cấu trúc rồi bật cờ.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Trang `/app/kb/policies` chỉ còn phần có cấu trúc; không còn form thêm/sửa/xóa chính sách văn bản — kiểm bằng: đọc diff + typecheck + `pnpm --filter @flow/web test`.
2. Ba Server Action `createPolicyAction`/`updatePolicyAction`/`deletePolicyAction` đã xóa, không còn tham chiếu; quét `requireAppUser` vẫn xanh — kiểm bằng: `src/server/require-app-user.scan.test.ts`.
3. Hàm DB `listPolicyItems`/`createPolicyItem`/`updatePolicyItem`/`deletePolicyItem` và đồng bộ `kb-sync` giữ nguyên (đang được worker và Shopify dùng) — kiểm bằng: `pnpm test` toàn bộ xanh.

## File sẽ đọc

`apps/web/src/app/app/(guarded)/kb/policies/page.tsx`, `kb/actions.ts`.

## File sẽ sửa / tạo

Sửa: `kb/policies/page.tsx`, `kb/actions.ts`, `docs/gap-matrix.md`.

## Migration

Không.

## Test viết trước

Không có hành vi mới; kiểm bằng bộ test hiện có.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/server/require-app-user.scan.test.ts`

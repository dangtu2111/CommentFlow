# Bàn giao — nhánh `feat-kb-publish-version`

Cập nhật: 06/11/2026 · Mục: KB-PUBLISH-VERSION · Agent vừa làm: claude (làn d)
Kế hoạch: `docs/plans/feat-kb-publish-version.md`

## Đã làm
- Lõi thuần `planKbVersion`, truy vấn DB, job worker `kb-publish`, trang `/app/kb-publish`, i18n vi+en, test (shared/worker/web đơn vị; `kb-publish.int.test.ts` chưa chạy được ở làn d vì không có DB → chạy ở CI).

## Còn lại
1. Xem CI chạy `kb-publish.int.test.ts` (làn b: `CF_LANE=b pnpm test:db`).
2. Gap: `KB-PUBLISH-POINTER`, `KB-PUBLISH-SOURCE-SNAPSHOT` (cần migration, làn b), `KB-PUBLISH-LABEL-DEMOTE` (+ KB-TESTSET).
3. `queue:install` ở staging để có hàng đợi `kb-publish` (CI/người điều phối).

# Bàn giao feat-onboarding-wizard (claude)

**Đã làm:** trang `/app/onboarding/setup?step=channels|pages|knowledge|invite` (Owner), hàm thuần `lib/onboarding-setup.ts` (+test), thanh Độ sẵn sàng, i18n vi/en, CSS `.setup-footer`, `createWorkspaceAction` chuyển tới wizard. Q-OBW1.
**Đã đọc, rút ra:** `channels/page.tsx` (FB_START_PATH + getEnabledFbConfig), `server/readiness.ts`, stepper có sẵn từ feat-ui-shell-onboarding.
**Còn lại:** ảnh trước/sau (cần DB + phiên; chưa chụp), E2E Playwright cho luồng wizard, khối Shopify/URL chính sách khi có connector.

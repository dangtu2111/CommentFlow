// Chụp /dev/ui/{settings,members,activity} (+ hộp thoại) để so với thiết kế Stitch (UI-first, nhóm 4).
// Dùng: node e2e/support/shot-settings.mjs <thư-mục-ra> [base]   (web chạy bằng `node e2e/support/dev-ui.mjs <cổng>`)
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/ui-settings';
const base = process.argv[3] ?? 'http://localhost:3101';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const pages = ['settings', 'members', 'activity'];

for (const [w, h, tag] of [
  [1440, 900, '1440'],
  [390, 844, '390'],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  for (const p of pages) {
    await page
      .goto(`${base}/dev/ui/${p}`, { waitUntil: 'networkidle', timeout: 120000 })
      .catch(() => {});
    await page.screenshot({ path: `${out}/${p}-${tag}.png`, fullPage: true });
  }
  // Hộp thoại: mở bằng nút thật và chụp khung nhìn.
  await page.goto(`${base}/dev/ui/settings`, { waitUntil: 'networkidle' }).catch(() => {});
  for (const [name, dialogId] of [
    ['doi-mat-khau', 'change-password-dialog'],
    ['tat-2fa', 'two-factor-disable-dialog'],
    ['tao-lai-ma', 'two-factor-regen-dialog'],
    ['bat-2fa-buoc-2', 'dev-setup-step2'],
  ]) {
    // Dev server có thể tải lại trang (HMR) giữa chừng → thử lại tới 3 lần.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.waitForLoadState('networkidle');
        await page.evaluate((id) => document.getElementById(id)?.showModal(), dialogId);
        if (name === 'doi-mat-khau') {
          await page.fill('#change-password-dialog input[name="newPassword"]', 'Abcdefg1!xyz');
          await page.fill('#change-password-dialog input[name="confirmPassword"]', 'Abcdefg1!xyz');
        }
        await page.screenshot({ path: `${out}/hop-thoai-${name}-${tag}.png` });
        await page.evaluate((id) => document.getElementById(id)?.close(), dialogId);
        break;
      } catch {
        await page.goto(`${base}/dev/ui/settings`, { waitUntil: 'networkidle' }).catch(() => {});
      }
    }
  }
  await page.close();
}
await browser.close();

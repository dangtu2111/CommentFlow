// Chụp 3 trang con Cài đặt ở /dev/ui (đối chiếu settings-billing.png) — UI-first, làn a (settings-pages).
// Dùng: node e2e/support/shot-settings-pages.mjs <thư-mục-ra> [base]   (web: `node e2e/support/dev-ui.mjs <cổng>`)
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/settings-pages';
const base = process.argv[3] ?? 'http://localhost:3151';
const PAGES = [
  ['goi-thanh-toan', 'settings-billing'],
  ['goi-chua-co-du-lieu', 'settings-billing?state=unknown'],
  ['du-lieu-rieng-tu', 'settings-privacy'],
  ['thong-bao', 'settings-notifications'],
];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [name, path] of PAGES) {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page
      .goto(`${base}/dev/ui/${path}`, { waitUntil: 'networkidle', timeout: 180000 })
      .catch(() => {});
    await page.screenshot({ path: `${out}/${name}-sau-${w}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();

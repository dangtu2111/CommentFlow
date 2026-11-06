// Chụp /dev/ui/settings (đối chiếu design/stitch/settings-security.png) — UI-first, làn a (settings-v2).
// Dùng: node e2e/support/shot-settings-v2.mjs <thư-mục-ra> <nhãn: truoc|sau> [base]
// (web: `node e2e/support/dev-ui.mjs <cổng>`)
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/settings-v2';
const tag = process.argv[3] ?? 'sau';
const base = process.argv[4] ?? 'http://localhost:3151';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page
    .goto(`${base}/dev/ui/settings`, { waitUntil: 'networkidle', timeout: 180000 })
    .catch(() => {});
  await page.screenshot({ path: `${out}/cai-dat-${tag}-${w}.png`, fullPage: true });
  await page.close();
}
await browser.close();

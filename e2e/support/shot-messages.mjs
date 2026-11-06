// Chụp trang mẫu dev Tin nhắn để so với design/stitch/messages.png (UI-first).
// Dùng: node e2e/support/shot-messages.mjs [thư-mục-ra] [base]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/ui-messages';
const base = process.argv[3] ?? 'http://localhost:3103';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [w, h, tag] of [
  [1440, 900, '1440'],
  [390, 844, '390'],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${base}/dev/ui/messages`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.screenshot({ path: `${out}/messages-sau-${tag}.png`, fullPage: true });
  await page.close();
}
await browser.close();

// Chụp khung + thanh bên /dev/ui/comments (đối chiếu design/stitch/comments.png) — UI-first, làn d (sidebar-reorg).
// Dùng: node e2e/support/shot-sidebar.mjs <thư-mục-ra> [base]   (web: `node e2e/support/dev-ui.mjs <cổng>`)
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/ui-sidebar-reorg';
const base = process.argv[3] ?? 'http://localhost:3114';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [w, h, tag] of [
  [1440, 900, '1440'],
  [390, 844, '390'],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page
    .goto(`${base}/dev/ui/comments`, { waitUntil: 'networkidle', timeout: 180000 })
    .catch(() => {});
  await page.screenshot({ path: `${out}/thanh-ben-sau-${tag}.png` });
  await page.close();
}
await browser.close();

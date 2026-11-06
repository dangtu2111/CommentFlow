// Chụp Cơ sở kiến thức + Bài viết ở /dev/ui (đối chiếu knowledge-base.png, posts.png) — UI-first, làn a (redo).
// Dùng: node e2e/support/shot-kb-posts.mjs <thư-mục-ra> <truoc|sau> [base]   (web: `node e2e/support/dev-ui.mjs 3101`)
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/redo-kb-posts';
const tag = process.argv[3] ?? 'sau';
const base = process.argv[4] ?? 'http://localhost:3101';
const PAGES = [
  ['kb', 'kb'],
  ['bai-viet', 'kb-posts'],
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
    const issues = await page.locator('nextjs-portal').count();
    if (issues > 0) console.log(`CẢNH BÁO: ${name} ${w}px có Next dev overlay`);
    await page.screenshot({ path: `${out}/${name}-${tag}-${w}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();

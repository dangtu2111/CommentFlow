// Chụp /dev/ui/settings ở nhiều độ rộng + in lỗi console/pageerror + kiểm tràn ngang của thanh con.
// Dùng: node e2e/support/shot-settings-layout.mjs <thư-mục-ra> <nhãn> [base]  (web: node e2e/support/dev-ui.mjs 3100)
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/settings-layout';
const tag = process.argv[3] ?? 'sau';
const base = process.argv[4] ?? 'http://localhost:3100';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const w of [1440, 1280, 1024, 390]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()))
      console.log(`[${w}] console.${m.type()}:`, m.text());
  });
  page.on('pageerror', (e) => console.log(`[${w}] pageerror:`, e.message));
  await page
    .goto(`${base}/dev/ui/settings`, { waitUntil: 'networkidle', timeout: 180000 })
    .catch(() => {});
  const m = await page.evaluate(() => {
    const nav = document.querySelector('.settings-subnav');
    const content = document.querySelector('.settings-content');
    const links = [...document.querySelectorAll('.settings-subnav-link')];
    const nr = nav?.getBoundingClientRect();
    const cr = content?.getBoundingClientRect();
    return {
      navW: nr && Math.round(nr.width),
      navRight: nr && Math.round(nr.right),
      contentLeft: cr && Math.round(cr.left),
      linkOverflow: links.some((l) => l.scrollWidth > l.clientWidth + 1),
      pageOverflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  console.log(`[${w}]`, JSON.stringify(m));
  await page.screenshot({ path: `${out}/${tag}-${w}.png`, fullPage: true });
  await page.close();
}
await browser.close();

// Chụp /dev/ui/settings ở nhiều bề rộng + đo lệch/cuộn ngang.
// Dùng: node e2e/support/shot-settings-width.mjs <thư-mục-ra> <truoc|sau> [base] [đường-dẫn]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/settings-width';
const tag = process.argv[3] ?? 'sau';
const base = process.argv[4] ?? 'http://localhost:3102';
const path = process.argv[5] ?? '/dev/ui/settings';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [w, h] of [
  [1280, 900],
  [1440, 900],
  [1920, 1080],
  [2560, 1300],
  [390, 844],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 180000 }).catch(() => {});
  await page.waitForSelector('.settings-subnav', { timeout: 180000 });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const nav = r('.settings-subnav');
    const title = r('.settings-content h1');
    const content = r('.settings-content');
    return {
      navTop: nav?.top,
      titleTop: title?.top,
      contentTop: content?.top,
      navLeft: nav?.left,
      navW: nav?.width,
      contentLeft: content?.left,
      contentW: content?.width,
      hScroll: document.documentElement.scrollWidth > innerWidth,
    };
  });
  console.log(w, JSON.stringify(m));
  await page.screenshot({ path: `${out}/cai-dat-${tag}-${w}.png`, fullPage: true });
  await page.close();
}
await browser.close();

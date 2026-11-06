// Tìm phần tử gây cuộn ngang ở 390px (bỏ qua phần tử nằm trong vùng tự cuộn). Dùng: node e2e/support/find-overflow.mjs <route> [base]
import { chromium } from '@playwright/test';

const route = (process.argv[2] ?? '').replace(/^\/\/+/, '/');
const base = process.argv[3] ?? 'http://localhost:3101';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
const wide = await page.evaluate(() => {
  const scrolls = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
    }
    return false;
  };
  return [...document.querySelectorAll('body *')]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !scrolls(el))
    .slice(0, 12)
    .map(
      (el) =>
        `${el.tagName}.${String(el.className).slice(0, 50)} right=${Math.round(el.getBoundingClientRect().right)}`,
    );
});
console.log(wide.join('\n'));
await browser.close();

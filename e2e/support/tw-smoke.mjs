// Kiểm nhanh: class Tailwind chép từ Stitch có hiệu lực trong `.tw` (trang /dev/ui/tailwind). Dùng: node e2e/support/tw-smoke.mjs [base]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3104';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/dev/ui/tailwind`, { waitUntil: 'networkidle' });
const got = await page.evaluate(() => {
  const btn = getComputedStyle(document.querySelector('.tw button'));
  const h1 = getComputedStyle(document.querySelector('.tw h1'));
  return {
    bg: btn.backgroundColor,
    padLeft: btn.paddingLeft,
    radius: btn.borderRadius,
    h1Size: h1.fontSize,
    h1Margin: h1.marginTop,
    font: h1.fontFamily.slice(0, 16),
  };
});
console.log(got);
await page.screenshot({ path: 'docs/plans/ui-fidelity/tailwind-foundation/tw-smoke.png' });
await browser.close();
const ok =
  got.bg === 'rgb(11, 114, 133)' &&
  got.padLeft === '12px' &&
  got.radius === '8px' &&
  got.h1Size === '30px';
process.exit(ok ? 0 : 1);

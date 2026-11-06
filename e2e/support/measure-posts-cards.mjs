// So rộng cột/thẻ trang Bài viết: HTML Stitch (file://) với /dev/ui/kb-posts ở 1440 và 1920px (sai lệch ≤ 2px; bản dựng không có thanh bên → cộng 256).
// Dùng: node e2e/support/measure-posts-cards.mjs [base]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3103';
const browser = await chromium.launch();
for (const w of [1440, 1920]) {
  const page = await browser.newPage({ viewport: { width: w, height: 1000 } });
  await page.goto(pathToFileURL(resolve('design/stitch/posts.html')).href, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(600);
  const stitch = await page.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll(
      'main > div > *, main aside, main [class*="col-span"]',
    )) {
      const r = e.getBoundingClientRect();
      if (r.height > 20)
        out.push(
          `${e.tagName.toLowerCase()} x${Math.round(r.x)} w${Math.round(r.width)} .${String(e.className).slice(0, 40)}`,
        );
    }
    return out.slice(0, 12);
  });
  // Route dev không có thanh bên 256px → thu cửa sổ lại 256px để vùng nội dung bằng Stitch.
  await page.setViewportSize({ width: w - 256, height: 1000 });
  await page.goto(`${base}/dev/ui/kb-posts`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const built = await page.evaluate(() =>
    ['.dev-kb-posts', '.posts-dev-feed', '.post-config', '.posts-dev-feed > *'].map((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return `${s} x${r ? Math.round(r.x) : '-'} w${r ? Math.round(r.width) : '-'}`;
    }),
  );
  console.log(`== ${w}px\nStitch:\n  ${stitch.join('\n  ')}\nBản dựng:\n  ${built.join('\n  ')}`);
  await page.close();
}
await browser.close();

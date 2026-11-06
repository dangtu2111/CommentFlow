// Đo bounding box các phần tử chính của HTML Stitch (file://) hoặc trang thật. Dùng: node measure-stitch.mjs <url> <rộng>
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const [url, width = '1440'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 1000 } });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
const rows = await page.evaluate(() => {
  const out = [];
  const main = document.querySelector('main');
  const walk = (el, depth) => {
    if (depth > 4) return;
    for (const c of el.children) {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      if (cs.display === 'contents') {
        walk(c, depth);
        continue;
      }
      if (r.height < 4) continue;
      out.push({
        d: depth,
        tag: c.tagName.toLowerCase(),
        cls: String(c.className).slice(0, 60),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        pad: cs.padding,
        gap: cs.gap,
      });
      walk(c, depth + 1);
    }
  };
  if (main) walk(main, 0);
  return out;
});
for (const r of rows)
  console.log(
    `${'  '.repeat(r.d)}${r.tag} x${r.x} y${r.y} w${r.w} h${r.h} pad[${r.pad}] gap[${r.gap}] ${r.cls}`,
  );
await browser.close();

// Chụp các trang CŨ để chứng minh thay đổi nền (Tailwind…) không làm đổi pixel.
// Dùng: node e2e/support/shot-regression.mjs <thư-mục-ra> [base]   (chạy trước và sau, rồi so: --diff <a> <b>)
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);

if (args[0] === '--diff') {
  const [, a, b] = args;
  let bad = 0;
  for (const f of readdirSync(a).filter((n) => n.endsWith('.png'))) {
    const same = Buffer.compare(readFileSync(`${a}/${f}`), readFileSync(`${b}/${f}`)) === 0;
    if (!same) bad += 1;
    console.log(`${same ? 'GIỐNG ' : 'KHÁC  '} ${f}`);
  }
  console.log(bad === 0 ? 'Khác biệt pixel = 0' : `${bad} ảnh khác`);
  process.exit(bad === 0 ? 0 : 1);
}

const out = args[0] ?? 'docs/plans/ui-fidelity/tailwind-foundation/shots';
const base = args[1] ?? 'http://localhost:3104';
const pages = [
  'login',
  'register',
  'dev/ui/kit',
  'dev/ui/comments',
  'dev/ui/settings',
  'dev/ui/automation',
  'dev/ui/leads',
];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [w, h, tag] of [
  [1440, 900, 'd'],
  [390, 844, 'm'],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  for (const p of pages) {
    await page.goto(`${base}/${p}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.screenshot({
      path: `${out}/${p.replaceAll('/', '_')}-${tag}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.close();
}
await browser.close();

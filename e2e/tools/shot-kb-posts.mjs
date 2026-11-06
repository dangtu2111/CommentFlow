// Chụp bản dựng Tailwind (route /dev/ui/*, dữ liệu [MẪU]) và HTML Stitch cạnh nhau, 1440px và 390px.
// Chạy: node e2e/tools/shot-kb-posts.mjs <thư-mục-ra> [http://localhost:3103]
// Không đọc .env. Stitch nạp Tailwind CDN: cần mạng, không có thì bỏ qua ảnh Stitch.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:3103';
if (!out) {
  console.error('Thiếu thư mục ra.');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const stitchUrl = (name) =>
  `file://${fileURLToPath(new URL(`../../design/stitch/${name}.html`, import.meta.url)).replaceAll('\\', '/')}`;

const SCREENS = [
  { slug: 'knowledge-base', route: '/dev/ui/kb' },
  { slug: 'posts', route: '/dev/ui/kb-posts' },
];
const WIDTHS = [1440, 390];

const browser = await chromium.launch();
for (const { slug, route } of SCREENS) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(out, `${slug}-build-${width}.png`), fullPage: true });
    await page.goto(stitchUrl(slug), { waitUntil: 'networkidle' }).catch(() => {});
    await page.screenshot({ path: join(out, `${slug}-stitch-${width}.png`), fullPage: true });
    await page.close();
  }
}
await browser.close();
console.log(`Đã ghi ảnh vào ${out}`);

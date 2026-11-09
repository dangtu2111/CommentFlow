// Chụp trang Chính sách có cấu trúc (route /dev/ui/kb-policies, dữ liệu [MẪU]) và HTML Stitch cạnh nhau, 1440px và 390px (bản Staff chỉ ở 1440px).
// Chạy: node e2e/tools/shot-kb-policies.mjs <thư-mục-ra> [http://localhost:3000]
// Không đọc .env. Stitch nạp Tailwind CDN: cần mạng, không có thì bỏ qua ảnh Stitch.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:3000';
if (!out) {
  console.error('Thiếu thư mục ra.');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const stitchUrl = `file://${fileURLToPath(new URL('../../design/stitch/kb-policies-structured.html', import.meta.url)).replaceAll('\\', '/')}`;

const SHOTS = [
  { name: 'build-1440', route: '/dev/ui/kb-policies', width: 1440 },
  { name: 'build-390', route: '/dev/ui/kb-policies', width: 390 },
  { name: 'build-staff-1440', route: '/dev/ui/kb-policies?staff=1', width: 1440 },
];

const browser = await chromium.launch();
for (const { name, route, width } of SHOTS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(out, `policies-${name}.png`), fullPage: true });
  await page.close();
}
for (const width of [1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(stitchUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.screenshot({ path: join(out, `policies-stitch-${width}.png`), fullPage: true });
  await page.close();
}
await browser.close();
console.log(`Đã ghi ảnh vào ${out}`);

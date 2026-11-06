// Chụp các trang xác thực để so với thiết kế (UI-first). Dùng: node e2e/support/shot-auth.mjs <thư-mục-ra> [base]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/ui-auth';
const base = process.argv[3] ?? 'http://localhost:3100';
const pages = [
  'login',
  'register',
  'forgot-password',
  'check-email?email=a%40b.vn',
  'reset-password?token=x',
  'verify-email',
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
    await page.screenshot({ path: `${out}/${p.split('?')[0]}-${tag}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();

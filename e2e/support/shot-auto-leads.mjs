// Chụp trang mẫu dev Tự động hóa / Quy tắc spam / Khách tiềm năng để so với thiết kế (UI-first, QAL1).
// Dùng: node e2e/support/shot-auto-leads.mjs [thư-mục-ra] [base]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/ui-auto-leads';
const base = process.argv[3] ?? 'http://localhost:3103';
const pages = ['automation', 'spam-rules', 'leads'];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [w, h, tag] of [
  [1440, 900, '1440'],
  [390, 844, '390'],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  for (const p of pages) {
    await page.goto(`${base}/dev/ui/${p}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.screenshot({ path: `${out}/${p}-sau-${tag}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();

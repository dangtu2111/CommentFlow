// Chụp khung chi tiết bài của Lịch đăng (COMPOSER-CALENDAR-UI): đăng nhập `/dev/login` (Owner mẫu `[MẪU]`, CHỈ DEV), mở bài đầu tiên của tuần có bài rồi chụp.
// Dùng: node e2e/support/shot-calendar-drawer.mjs <thư-mục-ra> [base]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [out, base = 'http://localhost:3000'] = process.argv.slice(2);
if (!out) {
  console.error('Dùng: node e2e/support/shot-calendar-drawer.mjs <thư-mục-ra> [base]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/dev/login?next=${encodeURIComponent('/app/calendar')}`, {
    waitUntil: 'networkidle',
  });
  const link = page.locator('a[href*="post="]').first();
  if ((await link.count()) === 0) throw new Error('Tuần này không có bài để mở.');
  await link.click();
  await page.waitForURL(/post=/);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${out}/calendar-drawer-1440.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/calendar-drawer-390.png` });
  console.log('đã chụp khung chi tiết bài');
} finally {
  await browser.close();
}

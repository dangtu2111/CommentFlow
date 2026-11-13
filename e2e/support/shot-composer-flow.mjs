// Chạy luồng thật của Biên tập bài viết (POST-PUBLISHING) bằng trình duyệt: đăng nhập `/dev/login` (Owner mẫu `[MẪU]`, CHỈ DEV), lưu một bản nháp, thấy nó ở Lịch, mở lại để sửa rồi XÓA (dọn dữ liệu).
// Dùng: node e2e/support/shot-composer-flow.mjs <thư-mục-ra> [base]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [out, base = 'http://localhost:3000'] = process.argv.slice(2);
if (!out) {
  console.error('Dùng: node e2e/support/shot-composer-flow.mjs <thư-mục-ra> [base]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const MESSAGE = `Bản nháp thử luồng ${Date.now()}`;
const browser = await chromium.launch();
const log = (step, ok, detail = '') =>
  console.log(`${ok ? 'ĐẠT' : 'LỖI'}  ${step}${detail ? ` — ${detail}` : ''}`);
let failed = false;
const check = (step, ok, detail) => {
  log(step, ok, detail);
  if (!ok) failed = true;
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${base}/dev/login?next=${encodeURIComponent('/app/composer')}`, {
    waitUntil: 'networkidle',
  });
  check('vào được /app/composer', new URL(page.url()).pathname === '/app/composer');

  // Khi cờ đăng bài TẮT: Lên lịch / Đăng ngay bị khóa, Lưu nháp bấm được.
  const state = await page.evaluate(() => ({
    draft: document.querySelector('button[value="draft"]')?.disabled,
    schedule: document.querySelector('button[value="schedule"]')?.disabled,
    publish: document.querySelector('button[value="publish"]')?.disabled,
    channels: document.querySelectorAll('input[name="channel"]:checked').length,
  }));
  check(
    'Lưu nháp bấm được; Lên lịch/Đăng ngay khóa khi chưa đủ điều kiện',
    state.draft === false && state.schedule === true && state.publish === true,
    JSON.stringify(state),
  );
  check('mặc định KHÔNG chọn kênh nào', state.channels === 0);

  await page.fill('textarea[name="message"]', MESSAGE);
  await page.locator('input[name="channel"]:not([disabled])').first().check();
  await page.screenshot({ path: `${out}/composer-filled-1440.png`, fullPage: true });
  await page.click('button[value="draft"]');
  await page.waitForURL(/\/app\/composer\?.*n=saved/);
  check(
    'lưu nháp → chuyển về Biên tập kèm thông báo "saved" và id bài',
    /id=[0-9a-f-]{36}/.test(page.url()) && page.url().includes('n=saved'),
  );
  check(
    'thông báo "Đã lưu bản nháp" hiện',
    (await page.locator('[role="status"]', { hasText: 'Đã lưu bản nháp' }).count()) > 0,
  );
  check(
    'ô nội dung được điền lại khi mở bài đã lưu',
    (await page.inputValue('textarea[name="message"]')) === MESSAGE,
  );
  await page.screenshot({ path: `${out}/composer-saved-1440.png`, fullPage: true });

  await page.goto(`${base}/app/calendar`, { waitUntil: 'networkidle' });
  check('bản nháp hiện ở khung "Bản nháp" của Lịch', (await page.getByText(MESSAGE).count()) > 0);
  await page.screenshot({ path: `${out}/calendar-drafts-1440.png`, fullPage: true });

  await page.getByText(MESSAGE).first().click();
  await page.waitForURL(/\/app\/composer\?id=/);
  check(
    'bấm bản nháp → mở lại để sửa',
    (await page.inputValue('textarea[name="message"]')) === MESSAGE,
  );

  await page.getByRole('button', { name: /Xóa/ }).first().click();
  await page.waitForURL(/\/app\/calendar\?.*n=deleted/);
  check('xóa → về Lịch kèm thông báo "deleted"', true);
  check('bản nháp đã biến mất', (await page.getByText(MESSAGE).count()) === 0);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);

// Chụp TRANG THẬT (đã đăng nhập bằng `/dev/login`, Owner mẫu `[MẪU]`, CHỈ DEV) ở 1440 và 390 px, ghi vào thư mục ảnh của màn.
// Dùng: node e2e/support/shot-real.mjs <route> <thư-mục-ra> <tiền-tố> [base]   ví dụ: node e2e/support/shot-real.mjs /app/kb docs/plans/ui-fidelity/kb-overview truoc
// Git Bash đổi `/app/...` thành đường dẫn Windows: gõ `//app/kb`.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [routeArg, out, tag, base = 'http://localhost:3000'] = process.argv.slice(2);
if (!routeArg || !out || !tag) {
  console.error('Dùng: node e2e/support/shot-real.mjs <route> <thư-mục-ra> <tiền-tố> [base]');
  process.exit(2);
}
const route = routeArg.replace(/^\/\/+/, '/');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/dev/login?next=${encodeURIComponent(route)}`, {
    waitUntil: 'networkidle',
  });
  if (!new URL(page.url()).pathname.startsWith('/app/')) {
    throw new Error('Không vào được trang (cần /dev/login bật ở dev và workspace mẫu).');
  }
  for (const [w, h, name] of [
    [1440, 900, '1440'],
    [390, 844, '390'],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: true });
    console.log(`${tag}-${name}: tràn ngang ${overflow}px`);
  }
} finally {
  await browser.close();
}

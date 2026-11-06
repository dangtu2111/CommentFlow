// Tải path SVG Material Symbols Outlined (FILL 0, wght 400, 24px) để dán vào bảng ánh xạ của Icon (chạy tay, một lần).
// Dùng: node e2e/support/fetch-material-icons.mjs auto_mode schedule ...
import { chromium } from '@playwright/test';

const names = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const name of names) {
  const url = `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/${name}/default/24px.svg`;
  const res = await page.request.get(url);
  const body = res.ok() ? await res.text() : `HTTP ${res.status()}`;
  console.log(`## ${name}\n${body}\n`);
}
await browser.close();

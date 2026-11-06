// Đăng nhập tài khoản demo THẬT (từ `pnpm dev:seed-demo --reset`), bật 2FA nếu cần, mở /app/settings:
// in lỗi console/pageerror và chụp ảnh ở 4 độ rộng. Mật khẩu chỉ đọc từ tệp đầu ra của seed (không in).
// Dùng: node e2e/support/shot-settings-real.mjs <tệp-đầu-ra-seed> <thư-mục-ra> <nhãn> [base]

import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [
  seedFile,
  out = 'docs/plans/ui-fidelity/settings-layout',
  tag = 'that',
  base = 'http://localhost:3000',
] = process.argv.slice(2);
const line = readFileSync(seedFile, 'utf8')
  .split('\n')
  .find((l) => /^\s*owner\s/.test(l));
const [, email, password] = line.trim().split(/\s+/);
const vi = JSON.parse(readFileSync('packages/shared/src/i18n/messages/vi.json', 'utf8'));
const tf = vi.auth.security.twoFactor;

function base32(buf) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  return bits
    .match(/.{1,5}/g)
    .map((c) => a[Number.parseInt(c.padEnd(5, '0'), 2)])
    .join('');
}
function unbase32(s) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.replace(/=+$/, '')) bits += a.indexOf(ch).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g).map((b) => Number.parseInt(b, 2)));
}
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', unbase32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
void base32;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: base,
  locale: 'vi-VN',
  viewport: { width: 1440, height: 900 },
});
await context.addCookies([{ name: 'NEXT_LOCALE', value: 'vi', url: base }]);
const page = await context.newPage();
const log = (w) => {
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()))
      console.log(`[${w}] console.${m.type()}:`, m.text().slice(0, 1500));
  });
  page.on('pageerror', (e) => console.log(`[${w}] pageerror:`, e.message.slice(0, 1500)));
};
log('login');
await page.goto('/login');
await page.getByLabel('Email', { exact: false }).first().fill(email);
await page.locator('input[type="password"]').first().fill(password);
await page.getByRole('button', { name: vi.auth.login.submit, exact: true }).click();
await page.waitForLoadState('networkidle');
console.log('sau đăng nhập:', new URL(page.url()).pathname);

if (!new URL(page.url()).pathname.startsWith('/app/settings')) {
  await page.goto('/app/security');
  const dialog = page.locator('#two-factor-setup-dialog');
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByLabel(tf.passwordLabel, { exact: true }).fill(password);
    await dialog.getByRole('button', { name: tf.start, exact: true }).click();
    const keyLine = dialog.locator('p', { hasText: tf.manualKey }).locator('code');
    await keyLine.waitFor();
    const secret = ((await keyLine.textContent()) ?? '').trim().replace(/\s+/g, '');
    const left = 30000 - (Date.now() % 30000);
    if (left < 4000) await new Promise((r) => setTimeout(r, left + 500));
    await dialog.getByLabel(tf.confirmLabel, { exact: true }).fill(totp(secret));
    await dialog.getByRole('button', { name: tf.confirm, exact: true }).click();
    await dialog.getByRole('button', { name: tf.saved, exact: true }).click();
    await page.waitForLoadState('networkidle');
  }
}

for (const w of [1440, 1280, 1024, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto('/app/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  console.log(`[${w}]`, new URL(page.url()).pathname);
  await page.screenshot({ path: `${out}/${tag}-${w}.png`, fullPage: true });
}
await browser.close();

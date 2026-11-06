// Đối chiếu icon cột "Trạng thái xử lý" (+ icon tiêu đề) giữa HTML Stitch (file://) và bản dựng.
// Dùng: node e2e/support/measure-comments-icons.mjs [thư-mục-ra] [base]  → <ra>/doi-chieu-icon.md + .json + ảnh.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/comments-icons';
const base = process.argv[3] ?? 'http://localhost:3104';
mkdirSync(out, { recursive: true });

// [nhãn Stitch, tab bản dựng]
const ROWS = [
  ['Sẽ tự gửi', 'scheduled_auto'],
  ['AI đã tự gửi', 'auto_replied'],
  ['Chờ duyệt', 'pending_review'],
  ['Cần nhân viên', 'needs_human'],
  ['Nghi spam', 'spam_suspected'],
  ['Gửi lỗi', 'send_failed'],
  ['Đã trả lời', 'replied'],
  ['Đã ẩn', 'hidden'],
  ['Bỏ qua', 'skipped'],
  ['Tất cả', 'all'],
];

const browser = await chromium.launch();
const stitch = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await stitch
  .goto(pathToFileURL(resolve('design/stitch/comments.html')).href, { waitUntil: 'networkidle' })
  .catch(() => {});
await stitch.evaluate(() => document.fonts.ready);
const sm = await stitch.evaluate((rows) => {
  const out = {};
  for (const [label] of rows) {
    const btn = [...document.querySelectorAll('.w-56 button')].find((b) =>
      b.textContent.includes(label),
    );
    const row = btn?.getBoundingClientRect();
    const ic = btn?.querySelector('span.flex > span:first-child');
    if (!ic) {
      out[label] = null;
      continue;
    }
    const r = ic.getBoundingClientRect();
    out[label] = {
      kind: ic.classList.contains('material-symbols-outlined')
        ? `icon:${ic.textContent.trim()}`
        : 'chấm',
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      dx: Math.round((r.x - row.x) * 10) / 10,
      dy: Math.round((r.y + r.height / 2 - (row.y + row.height / 2)) * 10) / 10,
      color: getComputedStyle(ic).color,
      bg: getComputedStyle(ic).backgroundColor,
    };
  }
  return out;
}, ROWS);
await stitch.screenshot({
  path: `${out}/stitch-1440.png`,
  clip: { x: 256, y: 120, width: 240, height: 420 },
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/dev/ui/comments`, { waitUntil: 'networkidle' }).catch(() => {});
const bm = await page.evaluate((rows) => {
  const out = {};
  for (const [label, tab] of rows) {
    const ic = document.querySelector(`[data-tab="${tab}"]`);
    const row = ic?.closest('.inbox-tab')?.getBoundingClientRect();
    if (!ic) {
      out[label] = null;
      continue;
    }
    const svg = ic.querySelector('svg');
    const r = (svg ?? ic).getBoundingClientRect();
    out[label] = {
      kind: svg ? 'svg' : 'chấm',
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      dx: Math.round((r.x - row.x) * 10) / 10,
      dy: Math.round((r.y + r.height / 2 - (row.y + row.height / 2)) * 10) / 10,
      color: getComputedStyle(svg ?? ic).color,
      bg: getComputedStyle(ic).backgroundColor,
    };
  }
  return out;
}, ROWS);
const tabs = await page.$('.inbox-tabs');
await tabs?.screenshot({ path: `${out}/sau-cot-1.png` });
await browser.close();

writeFileSync(`${out}/doi-chieu-icon.json`, JSON.stringify({ stitch: sm, build: bm }, null, 2));
const fmt = (v) =>
  v ? `${v.kind} ${v.w}×${v.h} @${v.dx},${v.dy} ${v.kind === 'chấm' ? v.bg : v.color}` : '—';
const lines = [
  '| Dòng | Stitch (icon · cỡ · lệch x,y · màu) | Bản dựng |',
  '|---|---|---|',
  ...ROWS.map(([l]) => `| ${l} | ${fmt(sm[l])} | ${fmt(bm[l])} |`),
];
writeFileSync(`${out}/doi-chieu-icon.md`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));

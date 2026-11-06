// So khung nội dung (rộng vùng nội dung + lề trái/phải) của HTML Stitch (file://) với bản dựng, ở 1440/1920/2560px.
// Dùng: node e2e/support/measure-content-frame.mjs [thư-mục-ra] [base]
// Kết quả: <ra>/so-khung.json + bảng markdown in ra stdout. Cổng xem trước của làn do điều phối khởi động sẵn.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/ui-fix-posts-layout';
const base = process.argv[3] ?? 'http://localhost:3103';
const WIDTHS = [1440, 1920, 2560];
/** [slug Stitch, route bản dựng] — route /dev/ui/* dùng đúng class khung trang của trang thật. */
const SCREENS = [
  ['posts', '/dev/ui/kb-posts'],
  ['knowledge-base', '/dev/ui/kb'],
  ['automation', '/dev/ui/automation'],
  ['spam-rules', '/dev/ui/spam-rules'],
  ['leads', '/dev/ui/leads'],
  ['reports', '/dev/ui/reports'],
  ['messages', '/dev/ui/messages'],
];

/** Khung nội dung = phần tử `main`: rộng vùng nội dung, lề trái/phải tới mép cửa sổ. */
const probe = () => {
  const main = document.querySelector('main');
  if (!main) return null;
  const vw = document.documentElement.clientWidth;
  // Khung = <main> hoặc khối con đầu tiên (sâu ≤ 4) có padding ngang > 0 hoặc max-width (Stitch đặt lề ở khối con).
  let frame = main;
  const hasFrame = (e) => {
    const cs = getComputedStyle(e);
    return Number.parseFloat(cs.paddingLeft) > 0 || cs.maxWidth !== 'none';
  };
  for (let d = 0; d < 4 && !hasFrame(frame); d++) {
    const next = [...frame.children].find((c) => c.getBoundingClientRect().height > 4);
    if (!next) break;
    frame = next;
  }
  const r = frame.getBoundingClientRect();
  const cs = getComputedStyle(frame);
  const pl = Number.parseFloat(cs.paddingLeft);
  const pr = Number.parseFloat(cs.paddingRight);
  // Thanh bên: bản dựng /dev/ui/* có thể không có khung ứng dụng → lề tính SAU thanh bên (256px nếu có).
  const nav = document.querySelector('.shell-nav, aside nav, nav.fixed, aside.fixed');
  const sidebar = nav && nav.getBoundingClientRect().width >= 200 ? 256 : 0;
  return {
    left: Math.round(r.left + pl - sidebar),
    right: Math.round(vw - r.right + pr),
    contentW: Math.round(r.width - pl - pr),
  };
};

const browser = await chromium.launch();
const rows = [];
for (const [slug, route] of SCREENS) {
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 1000 } });
    const stitchUrl = pathToFileURL(resolve('design/stitch', `${slug}.html`)).href;
    await page.goto(stitchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const stitch = await page.evaluate(probe);
    let built = null;
    try {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);
      built = await page.evaluate(probe);
    } catch (e) {
      built = { error: String(e).slice(0, 80) };
    }
    rows.push({ slug, width: w, stitch, built });
    await page.close();
  }
}
await browser.close();
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'so-khung.json'), JSON.stringify(rows, null, 2));
console.log(
  '| Trang | Cửa sổ | Stitch: nội dung / lề trái / lề phải | Bản dựng: nội dung / lề trái / lề phải | Lệch nội dung |',
);
console.log('|---|---|---|---|---|');
for (const r of rows) {
  const f = (m) => (m && !m.error ? `${m.contentW} / ${m.left} / ${m.right}` : 'n/a');
  const d = r.stitch && r.built && !r.built.error ? r.built.contentW - r.stitch.contentW : 'n/a';
  console.log(`| ${r.slug} | ${r.width} | ${f(r.stitch)} | ${f(r.built)} | ${d} |`);
}

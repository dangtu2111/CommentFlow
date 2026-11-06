// Đo nhịp dọc + bề ngang khung Cài đặt (trang /dev/ui/*) và so với HTML Stitch (file://). Sai lệch cho phép ≤ 2px.
// Dùng: node e2e/tools/settings-gaps.mjs [baseUrl]   (mặc định http://localhost:3101). Thoát 1 nếu có sai lệch.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const BASE = process.argv[2] ?? 'http://localhost:3101';
const WIDTHS = [1280, 1440, 1920, 2560];
const TOLERANCE = 2;
const ROOT = path.resolve(import.meta.dirname, '../..');
const stitchUrl = (slug) => pathToFileURL(path.join(ROOT, 'design/stitch', `${slug}.html`)).href;

/** [tên, route dev, file Stitch tương ứng]. Kênh/Nhật ký/Dữ liệu/Thông báo không có HTML riêng → so với chuẩn 16px. */
const PAGES = [
  ['Bảo mật', '/dev/ui/settings', 'settings-security'],
  ['Thành viên', '/dev/ui/members', 'settings-workspace-members'],
  ['Gói & Thanh toán', '/dev/ui/settings-billing', 'settings-billing'],
  ['Quyền riêng tư', '/dev/ui/settings-privacy', null],
  ['Thông báo', '/dev/ui/settings-notifications', null],
];
const STANDARD_GAP = 16;

/** Đo trang thật: khoảng cách giữa các thẻ liền kề, đầu trang → lưới, bề ngang khung so với vùng chính. */
async function measureApp(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top + scrollY,
        bottom: r.bottom + scrollY,
        left: r.left,
        right: r.right,
        width: r.width,
      };
    };
    const layout = document.querySelector('.settings-layout');
    const body = document.querySelector('.settings-body');
    const content = document.querySelector('.settings-content');
    const main = document.querySelector('main.app-page');
    const shellTop = document.querySelector('.shell-top');
    const header = layout.firstElementChild;
    const cards = [...content.children]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .map(box);
    const shell = document.querySelector('.shell-main');
    return {
      cardGaps: cards.slice(1).map((r, i) => Math.round(r.top - cards[i].bottom)),
      headerToBody: Math.round(box(body).top - box(header).bottom),
      subnavToContent: Math.round(
        box(content).left - box(document.querySelector('.settings-subnav')).right,
      ),
      firstTop: Math.round(
        box(document.querySelector('.settings-frame')).top - box(shellTop).bottom,
      ),
      sideLeft: Math.round(box(layout).left - box(shell).left),
      sideRight: Math.round(box(shell).right - box(layout).right),
      mainPad: getComputedStyle(main).paddingLeft,
    };
  });
}

/** Đo Stitch: các thẻ trong cột 9/12 liền kề + khoảng header → lưới. */
async function measureStitch(page) {
  return page.evaluate(() => {
    const col = [...document.querySelectorAll('div')].find((d) =>
      /xl:col-span-9/.test(d.className),
    );
    if (!col) return null;
    const rects = [...col.children]
      .filter((c) => c.getBoundingClientRect().height > 0)
      .map((c) => {
        const r = c.getBoundingClientRect();
        return { top: r.top + scrollY, bottom: r.bottom + scrollY };
      });
    const grid = col.parentElement.getBoundingClientRect();
    const head = col.parentElement.previousElementSibling.getBoundingClientRect();
    return {
      cardGaps: rects.slice(1).map((r, i) => Math.round(r.top - rects[i].bottom)),
      headerToBody: Math.round(grid.top - head.bottom),
    };
  });
}

const browser = await chromium.launch();
const failures = [];
const rows = [];
const check = (label, actual, expected) => {
  if (Math.abs(actual - expected) > TOLERANCE) failures.push(`${label}: ${actual} ≠ ${expected}`);
};

for (const [name, route, slug] of PAGES) {
  let stitch = null;
  if (slug) {
    const sp = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await sp.goto(stitchUrl(slug), { waitUntil: 'domcontentloaded' });
    await sp.waitForTimeout(500);
    stitch = await measureStitch(sp);
    await sp.close();
  }
  const stitchGap = stitch?.cardGaps[0] ?? STANDARD_GAP;
  const stitchHead = stitch?.headerToBody ?? STANDARD_GAP;
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    const m = await measureApp(page);
    await page.close();
    const tag = `${name} @${width}`;
    for (const g of m.cardGaps) check(`${tag} khoảng cách thẻ`, g, stitchGap);
    check(`${tag} đầu trang → lưới`, m.headerToBody, stitchHead);
    check(`${tag} cột trái ↔ nội dung`, m.subnavToContent, STANDARD_GAP);
    check(`${tag} lề trái = lề phải`, m.sideLeft, m.sideRight);
    if (m.sideLeft > 16 + TOLERANCE) failures.push(`${tag}: lề ngang ${m.sideLeft}px > 16px`);
    rows.push(
      `| ${name} | ${width} | ${[...new Set(m.cardGaps)].join('/') || '–'} (Stitch ${stitchGap}) | ${m.headerToBody} (${stitchHead}) | ${m.subnavToContent} | ${m.firstTop} | ${m.sideLeft}/${m.sideRight} |`,
    );
  }
}
await browser.close();

console.log(
  '| Trang | Rộng | Khoảng cách thẻ | Đầu trang→lưới | Cột↔nội dung | Đỉnh trang | Lề trái/phải |',
);
console.log('|---|---|---|---|---|---|---|');
console.log(rows.join('\n'));
if (failures.length) {
  console.error(`\nSAI LỆCH:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nOK: mọi khoảng cách khớp Stitch/chuẩn 16px (≤ 2px).');

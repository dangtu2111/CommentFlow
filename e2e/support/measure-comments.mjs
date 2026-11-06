// So bounding box + computed style của các phần tử chính: HTML Stitch (file://) và bản dựng (UI-first, HTML-first).
// Dùng: node e2e/support/measure-comments.mjs [thư-mục-ra] [base]
// Kết quả: <ra>/so-bbox.json + ảnh sau (1440 và 390). Cổng xem trước do điều phối khởi động sẵn.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/ui-html-comments';
const base = process.argv[3] ?? 'http://localhost:3101';
mkdirSync(out, { recursive: true });

/** Phần tử chính: [tên, bộ chọn Stitch, bộ chọn bản dựng]. */
const TARGETS = [
  ['thanh-bên', 'aside.fixed', '.shell-nav'],
  ['thanh-trên', 'header.fixed', '.shell-top'],
  // Bản dựng Tailwind (ADR 013) giữ cấu trúc của Stitch: main > [dải phụ, hàng cột].
  ['dải-phụ', 'main .h-11', 'main > div:first-child'],
  ['cột-1', 'main .w-56', 'main > div:nth-child(2) > :nth-child(1)'],
  ['cột-2', 'main .w-96', 'main > div:nth-child(2) > :nth-child(2)'],
  ['cột-3', 'main .flex-1.bg-surface-container-lowest', 'main > div:nth-child(2) > :nth-child(3)'],
  ['tab-đang-chọn', 'main .w-56 button.bg-primary-container', 'a[data-tab][aria-current="page"]'],
  [
    'thẻ-bình-luận-1',
    'main .w-96 .divide-y > div:nth-child(1)',
    'li[data-comment-id]:nth-child(1) > a',
  ],
  ['nút-gửi', 'main button.h-10', 'form button[type="submit"]'],
];
const PROPS = [
  'fontSize',
  'fontWeight',
  'color',
  'backgroundColor',
  'paddingTop',
  'paddingLeft',
  'borderRadius',
];

async function measure(page, selectorIndex) {
  return page.evaluate(
    ({ targets, props, selectorIndex }) =>
      targets.map((t) => {
        const el = document.querySelector(t[selectorIndex]);
        if (!el) return { name: t[0], missing: true };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          name: t[0],
          w: Math.round(r.width),
          h: Math.round(r.height),
          x: Math.round(r.x),
          y: Math.round(r.y),
          style: Object.fromEntries(props.map((p) => [p, cs[p]])),
        };
      }),
    { targets: TARGETS, props: PROPS, selectorIndex },
  );
}

const browser = await chromium.launch();
const result = {};
const stitch = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await stitch
  .goto(pathToFileURL(resolve('design/stitch/comments.html')).href, { waitUntil: 'networkidle' })
  .catch(() => {});
result.stitch = await measure(stitch, 1);
await stitch.screenshot({ path: `${out}/stitch-1440.png` });
for (const [w, h, tag] of [
  [1440, 900, '1440'],
  [390, 844, '390'],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${base}/dev/ui/comments`, { waitUntil: 'networkidle' }).catch(() => {});
  if (tag === '1440') result.build = await measure(page, 2);
  await page.screenshot({ path: `${out}/sau-${tag}.png`, fullPage: tag === '390' });
  await page.close();
}
writeFileSync(`${out}/so-bbox.json`, JSON.stringify(result, null, 2));
await browser.close();

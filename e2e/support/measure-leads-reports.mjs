// So bbox + computed style của phần tử chính: HTML Stitch (file://) và bản dựng — Khách tiềm năng, Báo cáo, Nhật ký.
// Dùng: node e2e/support/measure-leads-reports.mjs [thư-mục-ra] [base]
// Kết quả: <ra>/so-bbox.json + ảnh stitch/sau (1440 và 390). Cổng xem trước do điều phối khởi động sẵn.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/ui-html-leads-reports';
const base = process.argv[3] ?? 'http://localhost:3103';
mkdirSync(out, { recursive: true });

/** [tên, bộ chọn Stitch, bộ chọn bản dựng] */
const SCREENS = {
  leads: {
    route: '/dev/ui/leads',
    targets: [
      ['tiêu-đề', 'main h1', '.page-title'],
      ['ô-số-liệu', 'main .grid > .bg-surface-container-lowest.rounded-xl', '.info-tile'],
      ['cột', 'div[class*="bg-surface-container-low/60"]', '.lead-col'],
      ['đầu-cột', 'div[class*="bg-surface-container-low/60"] > div:first-child', '.lead-col-head'],
      [
        'thẻ-lead',
        'div[class*="bg-surface-container-low/60"] > div.bg-surface-container-lowest',
        '.lead-card',
      ],
      ['ô-SĐT', 'div.bg-surface-container-lowest > div.rounded-lg.bg-surface-container-low', '.lead-card-contact'],
    ],
  },
  reports: {
    route: '/dev/ui/reports',
    targets: [
      ['tiêu-đề', 'main h1', '.page-title'],
      ['ô-số-liệu', 'main .grid > .bg-surface-container-lowest.rounded-xl', '.info-tile'],
      ['đầu-bảng', 'main table thead th:first-child', '.data-table thead th:first-child'],
      ['ô-bảng', 'main table tbody td:first-child', '.data-table tbody td:first-child'],
    ],
  },
  'activity-log': {
    route: '/dev/ui/activity',
    targets: [
      ['đầu-bảng', 'main table thead th:first-child', '.data-table thead th:first-child'],
      ['ô-bảng', 'main table tbody td:first-child', '.data-table tbody td:first-child'],
      ['bảng', 'main table', '.data-table'],
    ],
  },
};
const PROPS = [
  'fontSize',
  'fontWeight',
  'color',
  'backgroundColor',
  'paddingTop',
  'paddingLeft',
  'borderRadius',
];

async function measure(page, targets, idx) {
  return page.evaluate(
    ({ targets, props, idx }) =>
      targets.map((t) => {
        const el = document.querySelector(t[idx]);
        if (!el) return { name: t[0], missing: true };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          name: t[0],
          w: Math.round(r.width),
          h: Math.round(r.height),
          style: Object.fromEntries(props.map((p) => [p, cs[p]])),
        };
      }),
    { targets, props: PROPS, idx },
  );
}

const browser = await chromium.launch();
const result = {};
for (const [slug, { route, targets }] of Object.entries(SCREENS)) {
  const stitch = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await stitch
    .goto(pathToFileURL(resolve(`design/stitch/${slug}.html`)).href, { waitUntil: 'load' })
    .catch(() => {});
  result[slug] = { stitch: await measure(stitch, targets, 1) };
  await stitch.screenshot({ path: `${out}/${slug}-stitch-1440.png`, fullPage: true });
  for (const [w, h, tag] of [
    [1440, 900, '1440'],
    [390, 844, '390'],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
    if (tag === '1440') result[slug].build = await measure(page, targets, 2);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    result[slug][`overflow${tag}`] = overflow;
    await page.screenshot({ path: `${out}/${slug}-sau-${tag}.png`, fullPage: true });
    await page.close();
  }
}
writeFileSync(`${out}/so-bbox.json`, JSON.stringify(result, null, 2));
await browser.close();

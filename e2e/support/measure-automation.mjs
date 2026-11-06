// So bbox + computed style của phần tử chính: HTML Stitch (file://) và bản dựng — Tự động hóa + Quy tắc spam.
// Dùng: node e2e/support/measure-automation.mjs [thư-mục-ra] [base]
// Kết quả: <ra>/so-bbox.json + ảnh stitch/sau (1440 và 390). Cổng xem trước do điều phối khởi động sẵn.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/ui-html-automation';
const base = process.argv[3] ?? 'http://localhost:3103';
mkdirSync(out, { recursive: true });

/** [tên, bộ chọn Stitch, bộ chọn bản dựng] */
const SCREENS = {
  automation: {
    route: '/dev/ui/automation',
    targets: [
      ['thẻ-ma-trận', 'main .p-space-lg.space-y-space-md', '.auto-card:nth-of-type(1)'],
      ['bảng-ma-trận', 'main table', '.auto-table'],
      ['đầu-bảng', 'main thead th:first-child', '.auto-table thead th:first-child'],
      ['viên-chế-độ', 'main td .rounded-full', '.mode-select'],
      ['khối-ngưỡng', 'main .p-4.rounded-xl.bg-surface-container-low', '.auto-guard-grid .inset'],
      ['thanh-lưu', 'main > div > div:last-child > .bg-surface-container-low', '.auto-savebar'],
    ],
  },
  'spam-rules': {
    route: '/dev/ui/spam-rules',
    targets: [
      ['tiêu-đề', 'main h1', '.page-title'],
      ['khối-nền', 'main .bg-surface-container-low.rounded-xl', '.inset'],
      ['nút-chính', 'main #btn-save-active', '.spam-builder-actions .btn-primary'],
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

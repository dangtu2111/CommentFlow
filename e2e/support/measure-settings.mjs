// So bounding box + computed style: HTML Stitch (file://) và bản dựng trang Cài đặt (UI-first, HTML-first).
// Dùng: node e2e/support/measure-settings.mjs [thư-mục-ra] [base]
// Kết quả: <ra>/so-bbox.json + ảnh (1440 và 390). Cổng xem trước do điều phối khởi động sẵn.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'docs/plans/ui-fidelity/ui-html-settings';
const base = process.argv[3] ?? 'http://localhost:3101';
mkdirSync(out, { recursive: true });

/** Mỗi màn: slug Stitch, route bản dựng, và danh sách [tên, bộ chọn Stitch, bộ chọn bản dựng]. */
const SCREENS = [
  {
    slug: 'settings-security',
    route: '/dev/ui/settings',
    targets: [
      ['thanh-bên', 'aside.fixed', '.shell-nav'],
      ['thanh-trên', 'header.fixed', '.shell-top'],
      ['tiêu-đề', 'main h1', '.settings-frame h1'],
      ['cột-con', 'main .xl\\:col-span-3 > div:first-child', '.settings-subnav'],
      [
        'mục-con-đang-chọn',
        'main .xl\\:col-span-3 a.bg-primary-container',
        '.settings-subnav-link[aria-current="page"]',
      ],
      [
        'thẻ-2fa',
        'main .xl\\:col-span-9 > div:nth-child(1)',
        '.settings-content > section:nth-of-type(1)',
      ],
      [
        'thẻ-tài-khoản',
        'main .xl\\:col-span-9 > div:nth-child(2)',
        '.settings-content > section:nth-of-type(2)',
      ],
      [
        'thẻ-phiên',
        'main .xl\\:col-span-9 > div:nth-child(3)',
        '.settings-content > section:nth-of-type(4)',
      ],
    ],
  },
  {
    slug: 'settings-workspace-members',
    route: '/dev/ui/members',
    targets: [['tiêu-đề', 'main h1', '.settings-frame h1']],
  },
  {
    slug: 'settings-billing',
    route: '/dev/ui/settings-billing',
    targets: [['tiêu-đề', 'main h1', '.settings-frame h1']],
  },
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

async function measure(page, targets, selectorIndex) {
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
          y: Math.round(r.y + window.scrollY),
          style: Object.fromEntries(props.map((p) => [p, cs[p]])),
        };
      }),
    { targets, props: PROPS, selectorIndex },
  );
}

const browser = await chromium.launch();
const result = {};
for (const screen of SCREENS) {
  const stitch = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await stitch
    .goto(pathToFileURL(resolve(`design/stitch/${screen.slug}.html`)).href, {
      waitUntil: 'load',
    })
    .catch(() => {});
  await stitch.waitForTimeout(1500); // Tailwind CDN dựng class sau khi tải
  const entry = { stitch: await measure(stitch, screen.targets, 1) };
  await stitch.screenshot({ path: `${out}/${screen.slug}-stitch-1440.png`, fullPage: true });
  for (const [w, h, tag] of [
    [1440, 900, '1440'],
    [390, 844, '390'],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${base}${screen.route}`, { waitUntil: 'networkidle' }).catch(() => {});
    if (tag === '1440') entry.build = await measure(page, screen.targets, 2);
    await page.screenshot({ path: `${out}/${screen.slug}-sau-${tag}.png`, fullPage: true });
    await page.close();
  }
  result[screen.slug] = entry;
}
writeFileSync(`${out}/so-bbox.json`, JSON.stringify(result, null, 2));
await browser.close();

// So bounding box + computed style: file HTML Stitch (file://) với bản dựng xem trước (route /dev/ui/*, dữ liệu [MẪU]).
// Chạy: node e2e/tools/ui-compare-kb-posts.mjs [http://localhost:3103]  — in bảng markdown. Không đọc .env, không ghi gì ngoài stdout.
// Stitch nạp Tailwind CDN: cần mạng; không có mạng thì cột Stitch hiện "—".
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3103';
const file = (name) =>
  `file://${fileURLToPath(new URL(`../../design/stitch/${name}`, import.meta.url)).replaceAll('\\', '/')}`;

const PICK = ['borderRadius', 'paddingLeft', 'paddingTop', 'fontSize', 'lineHeight', 'fontWeight'];
const SCREENS = [
  {
    name: 'Cơ sở kiến thức',
    stitch: file('knowledge-base.html'),
    mine: `${base}/dev/ui/kb`,
    targets: [
      { name: 'Cột rail', stitch: 'main nav.lg\\:w-56', mine: '.rail' },
      {
        name: 'Mục rail (hiện tại)',
        stitch: 'main nav.lg\\:w-56 a:first-of-type',
        mine: '.rail-link[aria-current=page]',
      },
      {
        name: 'Mục rail (thường)',
        stitch: 'main nav.lg\\:w-56 a:nth-of-type(2)',
        mine: '.rail-group .rail-link:not([aria-current])',
      },
      { name: 'Thanh độ đầy đủ', stitch: 'main .rounded-full.h-2', mine: '.kb-complete progress' },
      { name: 'Thanh lệnh', stitch: 'main .sticky', mine: '.kb-bar' },
    ],
  },
  {
    name: 'Bài viết',
    stitch: file('posts.html'),
    mine: `${base}/dev/ui/kb-posts`,
    targets: [
      { name: 'Thẻ bài', stitch: 'main .lg\\:col-span-7 > div.relative', mine: '.posts-item' },
      {
        name: 'Nhãn nền tảng',
        stitch: 'main .lg\\:col-span-7 .rounded-full.bg-primary-container',
        mine: '.posts-item .chip',
      },
    ],
  },
];

async function measure(page, selector) {
  return page.evaluate(
    ([sel, pick]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        ...Object.fromEntries(pick.map((k) => [k, cs[k]])),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    },
    [selector, PICK],
  );
}

const browser = await chromium.launch();
const rows = [];
for (const screen of SCREENS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctx.newPage();
  await a.goto(screen.stitch, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  const b = await ctx.newPage();
  await b.goto(screen.mine, { waitUntil: 'networkidle' });
  for (const t of screen.targets) {
    const [s, m] = [await measure(a, t.stitch), await measure(b, t.mine)];
    rows.push(
      `| ${screen.name} | ${t.name} | ${s ? `${s.w}×${s.h}` : '—'} | ${m ? `${m.w}×${m.h}` : '—'} | ${s?.borderRadius ?? '—'} / ${m?.borderRadius ?? '—'} | ${s?.fontSize ?? '—'} / ${m?.fontSize ?? '—'} | ${s?.paddingLeft ?? '—'} / ${m?.paddingLeft ?? '—'} |`,
    );
  }
  await ctx.close();
}
await browser.close();
console.log(
  '| Màn | Phần tử | Stitch (w×h) | Bản dựng (w×h) | Bo góc (S / D) | Cỡ chữ (S / D) | Đệm trái (S / D) |\n|---|---|---|---|---|---|---|',
);
console.log(rows.join('\n'));

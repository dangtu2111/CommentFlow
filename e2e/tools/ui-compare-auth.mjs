// So bounding box + computed style của khung đăng nhập: file HTML Stitch (file://) với bản dựng (xem trước).
// Chạy: node e2e/tools/ui-compare-auth.mjs [http://localhost:3101]  — in bảng markdown. Không đọc .env, không ghi gì ngoài stdout.
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3101';
const stitch = `file://${fileURLToPath(new URL('../../design/stitch/auth-login-register.html', import.meta.url)).replaceAll('\\', '/')}`;

const PICK = [
  'width',
  'height',
  'borderRadius',
  'paddingLeft',
  'fontSize',
  'lineHeight',
  'fontWeight',
];
const TARGETS = [
  { name: 'Đầu trang', stitch: 'header', mine: '.auth-header' },
  { name: 'Panel trái', stitch: 'main .lg\\:col-span-6:first-child', mine: '.auth-panel' },
  { name: 'Thẻ đăng nhập', stitch: 'main .shadow-xl', mine: '.auth-card' },
  { name: 'Tiêu đề thẻ', stitch: '#auth-title', mine: '.auth-card .auth-title' },
  { name: 'Ô email', stitch: '#login-email', mine: '.auth-card input[name=email]' },
  {
    name: 'Nút gửi',
    stitch: '#login-form button[type=submit]',
    mine: '.auth-card form button[type=submit]',
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
for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const a = await ctx.newPage();
  await a.goto(stitch, { waitUntil: 'networkidle' }).catch(() => {});
  const b = await ctx.newPage();
  await b.goto(`${base}/login`, { waitUntil: 'networkidle' });
  for (const t of TARGETS) {
    const [s, m] = [await measure(a, t.stitch), await measure(b, t.mine)];
    rows.push(
      `| ${width} | ${t.name} | ${s ? `${s.w}×${s.h}` : '—'} | ${m ? `${m.w}×${m.h}` : '—'} | ${s?.borderRadius ?? '—'} / ${m?.borderRadius ?? '—'} | ${s?.fontSize ?? '—'} / ${m?.fontSize ?? '—'} |`,
    );
  }
  await ctx.close();
}
await browser.close();
console.log(
  '| Rộng | Phần tử | Stitch (w×h) | Bản dựng (w×h) | Bo góc (S / D) | Cỡ chữ (S / D) |\n|---|---|---|---|---|---|',
);
console.log(rows.join('\n'));

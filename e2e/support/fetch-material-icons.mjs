// Tải path SVG Material Symbols Outlined (FILL 0, wght 400, 24px) và ghi vào bảng ánh xạ của Icon (chạy tay khi HTML Stitch có icon mới).
// Dùng:  node e2e/support/fetch-material-icons.mjs --stitch   (quét design/stitch/*.html, thêm icon còn thiếu)
//        node e2e/support/fetch-material-icons.mjs auto_mode schedule   (thêm theo tên)
// Ghi apps/web/src/components/ui/icon-paths.ts (giữ icon đã có, sắp xếp theo tên).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = new URL('../../apps/web/src/components/ui/icon-paths.ts', import.meta.url);
const STITCH = new URL('../../design/stitch/', import.meta.url);

const args = process.argv.slice(2);
const wanted = new Set(args.filter((a) => !a.startsWith('--')));
if (args.includes('--stitch')) {
  for (const f of readdirSync(STITCH).filter((n) => n.endsWith('.html'))) {
    const html = readFileSync(new URL(f, STITCH), 'utf8');
    for (const m of html.matchAll(/material-symbols-outlined[^>]*>\s*([a-z_0-9]+)\s*</g)) {
      wanted.add(m[1]);
    }
  }
}

const current = {};
for (const m of readFileSync(OUT, 'utf8').matchAll(/^\s{2}([a-z_0-9]+):\s*'([^']+)',?$/gm)) {
  current[m[1]] = m[2];
}

const missing = [...wanted].filter((n) => !(n in current));
console.log(`đã có ${Object.keys(current).length}, cần tải ${missing.length}`);
const failed = [];
async function load(name) {
  const url = `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/${name}/default/24px.svg`;
  const res = await fetch(url);
  const d = res.ok ? (await res.text()).match(/<path d="([^"]+)"/)?.[1] : undefined;
  if (d) current[name] = d;
  else failed.push(name);
}
for (let i = 0; i < missing.length; i += 8) {
  await Promise.all(missing.slice(i, i + 8).map(load));
}

const body = Object.keys(current)
  .sort()
  .map((n) => `  ${n}:\n    '${current[n]}',`)
  .join('\n');
writeFileSync(
  OUT,
  `// Sinh bởi e2e/support/fetch-material-icons.mjs — path Material Symbols Outlined (FILL 0, wght 400), viewBox \`0 -960 960 960\`.\nexport const ICON_PATHS = {\n${body}\n} as const;\n`,
);
if (failed.length) console.log('Không tải được:', failed.join(', '));

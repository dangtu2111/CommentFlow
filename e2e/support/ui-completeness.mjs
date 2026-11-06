// Đối chiếu NỘI DUNG chữ: HTML Stitch (file://) ↔ trang thật. In mục CÓ trong HTML nhưng THIẾU trong trang.
//
// Một màn:  node e2e/support/ui-completeness.mjs <slug> <route[,route2…]> [--base url] [--out file.md] [--min 95] [--scope main]
//   <slug>  = design/stitch/<slug>.html
//   <route> = trang thật hoặc trang mẫu dev (/dev/ui/<tên>, không cần đăng nhập). Nhiều route (cách nhau dấu phẩy)
//             = gộp chữ của mọi route (màn có nhiều tab/khung nhìn). Trên Git Bash gõ `//dev/ui/x` để tránh đổi đường dẫn.
// Nhiều màn: node e2e/support/ui-completeness.mjs --batch <file.json> [--base url] [--out file.md]
//   file.json = [{ "slug": "...", "routes": ["/dev/ui/..."] }, …] — in bảng tóm tắt + mục thiếu từng màn (chạy nhanh).
// Thoát 1 khi có màn dưới ngưỡng --min (mặc định 95%).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import {
  collectVisibleTextsInBrowser,
  compareTexts,
  formatReport,
} from '../../scripts/lib/ui-completeness.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const base = opt('base', 'http://localhost:3101');
const min = Number(opt('min', '95'));
const out = opt('out');
const scope = opt('scope', 'main'); // chỉ đối chiếu vùng <main> (vỏ ứng dụng có kit riêng); '' = cả trang
const batchFile = opt('batch');

const normalizeRoute = (route) => route.replace(/^\/\/+/, '/');

const jobs = batchFile
  ? JSON.parse(readFileSync(batchFile, 'utf8'))
  : [{ slug: positional[0], routes: (positional[1] ?? '').split(',').filter(Boolean) }];
if (jobs.some((j) => !j.slug || !j.routes?.length)) {
  console.error(
    'Dùng: node e2e/support/ui-completeness.mjs <slug> <route[,route2]> | --batch <file.json>',
  );
  process.exit(2);
}

async function pageTexts(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  return page.evaluate(collectVisibleTextsInBrowser, scope);
}

async function compareJob(page, { slug, routes }) {
  const htmlUrl = pathToFileURL(resolve('design/stitch', `${slug}.html`)).href;
  // HTML Stitch tải Tailwind CDN/phông từ mạng: lỗi mạng không làm hỏng việc trích chữ.
  await page.goto(htmlUrl, { waitUntil: 'load' }).catch(() => {});
  const htmlTexts = await page.evaluate(collectVisibleTextsInBrowser, scope);
  const texts = [];
  for (const route of routes)
    texts.push(...(await pageTexts(page, `${base}${normalizeRoute(route)}`)));
  return compareTexts(htmlTexts, texts);
}

const browser = await chromium.launch();
const reports = [];
const rows = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const job of jobs) {
    const routes = job.routes.map(normalizeRoute);
    try {
      const result = await compareJob(page, { slug: job.slug, routes });
      reports.push(formatReport(job.slug, routes.join(' + '), result));
      rows.push({ slug: job.slug, routes, result });
      if (result.percent < min) process.exitCode = 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message.split('\n')[0] : 'lỗi không rõ';
      reports.push(`# ${job.slug} (${routes.join(' + ')})\n\nKhông đo được: ${reason}\n`);
      rows.push({ slug: job.slug, routes, error: reason });
      process.exitCode = 1;
    }
  }
} finally {
  await browser.close();
}

const summary = batchFile
  ? `${[
      '# Kiểm kê đủ thành phần (đối chiếu chữ HTML Stitch ↔ trang)',
      '',
      '| Màn | Route | Khớp | Thiếu |',
      '|---|---|---|---|',
      ...rows.map((r) =>
        r.error
          ? `| ${r.slug} | ${r.routes.join(', ')} | không đo được | ${r.error} |`
          : `| ${r.slug} | ${r.routes.join(', ')} | ${r.result.matched.length}/${r.result.total} = ${r.result.percent.toFixed(1)}% | ${r.result.missing.length} |`,
      ),
      '',
    ].join('\n')}\n`
  : '';
const output = `${summary}${reports.join('\n')}`;
process.stdout.write(output);
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, output);
}

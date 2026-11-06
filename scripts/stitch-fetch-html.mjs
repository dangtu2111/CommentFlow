// Tải HTML của mọi màn trong dự án Stitch về design/stitch/<slug>.html (nguồn dựng giao diện: HTML-first).
// Dùng: node --env-file-if-exists=.env.local scripts/stitch-fetch-html.mjs [--only slug,slug] [--dry]
// Cần biến môi trường STITCH_API_KEY (đặt trong .env.local; không bao giờ in/ghi khóa).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'design', 'stitch');
const API = 'https://stitch.googleapis.com/v1';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const onlyArg = args.find((a) => a === '--only') ? args[args.indexOf('--only') + 1] : '';
const only = new Set(onlyArg ? onlyArg.split(',') : []);

const key = process.env.STITCH_API_KEY;
if (!key) {
  console.error('Thiếu STITCH_API_KEY (đặt trong .env.local).');
  process.exit(1);
}

const manifestPath = join(DIR, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const projectId = manifest.project_id;
const headers = { 'X-Goog-Api-Key': key };

async function getJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.replace(key, '***')}`);
  return res.json();
}

/** Tải một tệp Stitch. Đường dẫn :download có thể trả JSON bọc (downloadUrl/content) hoặc nội dung thô. */
async function download(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi tải tệp`);
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const json = await res.json();
    const inner = json.downloadUrl ?? json.url ?? json.signedUrl;
    if (typeof json.dataString === 'string') return json.dataString;
    if (typeof json.content === 'string') return json.content;
    if (typeof json.html === 'string') return json.html;
    if (inner) {
      const r2 = await fetch(inner);
      if (!r2.ok) throw new Error(`HTTP ${r2.status} khi tải downloadUrl`);
      return r2.text();
    }
    throw new Error('JSON bọc không có nội dung/liên kết tải');
  }
  return res.text();
}

const slugByStitchId = new Map(manifest.screens.map((s) => [s.stitch_id, s.slug]));

function slugify(title) {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const list = await getJson(`${API}/projects/${projectId}/screens`);
const screens = (list.screens ?? []).filter((s) => s.htmlCode?.mimeType === 'text/html');
console.log(`Stitch: ${screens.length} màn có HTML`);

const results = { ok: [], skip: [], fail: [] };
for (const screen of screens) {
  const id = screen.name.split('/').pop();
  const slug = slugByStitchId.get(id) ?? slugify(screen.title ?? id);
  if (only.size && !only.has(slug)) {
    results.skip.push(slug);
    continue;
  }
  if (dry) {
    console.log(`(dry) ${slug}  <-  ${screen.title}`);
    continue;
  }
  try {
    const raw = await download(screen.htmlCode.downloadUrl);
    if (!/<html|<!doctype|<body/i.test(raw)) throw new Error('nội dung không giống HTML');
    // Bản thiết kế có thể chứa chuỗi giống token (ví dụ dummyToken trong email-invite): thay bằng giá trị rõ ràng là giả
    // để máy quét bí mật (gitleaks) không báo nhầm; không nới cấu hình quét.
    const html = raw.replace(/(dummyToken\s*=\s*')[^']{16,}(')/g, '$1DUMMY_TOKEN_DESIGN_ONLY$2');
    await mkdir(DIR, { recursive: true });
    await writeFile(join(DIR, `${slug}.html`), html, 'utf8');
    if (!slugByStitchId.has(id)) {
      manifest.screens.push({
        stitch_id: id,
        name: screen.title ?? slug,
        slug,
        updated: null,
        files: [`${slug}.html`],
      });
      slugByStitchId.set(id, slug);
    } else {
      const entry = manifest.screens.find((s) => s.stitch_id === id);
      if (entry && !entry.files.includes(`${slug}.html`)) entry.files.push(`${slug}.html`);
    }
    results.ok.push(slug);
    console.log(`ok   ${slug}  (${html.length} ký tự)`);
  } catch (err) {
    results.fail.push(`${slug}: ${err.message}`);
    console.error(`LỖI ${slug}: ${err.message}`);
  }
}

if (!dry) {
  manifest.synced_at = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
console.log(
  `Xong: ${results.ok.length} tải, ${results.skip.length} bỏ qua, ${results.fail.length} lỗi`,
);
process.exit(results.fail.length ? 1 : 0);

// Quyết định job CI nào cần chạy theo đường dẫn thay đổi (ADR 015). Mặc định an toàn: không chắc → chạy hết.
// Node và gitleaks luôn chạy (không đi qua đây). Chỉ lọc ba job nặng: database, e2e, python.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ALL = Object.freeze({ database: true, e2e: true, python: true });
const NONE = Object.freeze({ database: false, e2e: false, python: false });

const basename = (path) => path.slice(path.lastIndexOf('/') + 1);

/** File dùng chung: đụng vào là chạy hết. */
function isSharedFile(path) {
  const name = basename(path);
  return (
    path.startsWith('.github/') ||
    path.startsWith('scripts/') ||
    path.startsWith('infra/') ||
    path === 'package.json' ||
    path === 'pnpm-lock.yaml' ||
    path === 'pnpm-workspace.yaml' ||
    path === 'biome.json' ||
    path === '.nvmrc' ||
    /^tsconfig.*\.json$/.test(name)
  );
}

/** Tài liệu/thiết kế: không ảnh hưởng job nặng nào. */
function isDocsOnly(path) {
  return path.startsWith('docs/') || path.startsWith('design/') || path.endsWith('.md');
}

/** Luật theo thư mục; `null` = đường dẫn lạ (người gọi sẽ chạy hết). */
function rulesFor(path) {
  if (isDocsOnly(path)) return NONE;
  if (path.startsWith('packages/db/migrations/')) return { ...NONE, database: true };
  if (path.startsWith('packages/db/tests/')) return { ...NONE, database: true };
  if (path.startsWith('packages/db/src/')) return { ...NONE, database: true };
  if (path.startsWith('apps/web/src/server/')) return { ...NONE, database: true, e2e: true };
  if (path.startsWith('apps/web/')) return { ...NONE, e2e: true };
  if (path.startsWith('e2e/')) return { ...NONE, e2e: true };
  if (path.startsWith('packages/saas-core/') || path.startsWith('packages/shared/')) {
    return { ...NONE, database: true, e2e: true };
  }
  if (path.startsWith('apps/worker/')) return { ...NONE, database: true };
  if (path.startsWith('services/ml/')) return { ...NONE, python: true };
  return null;
}

/**
 * @param {string[]} paths đường dẫn đổi (dấu `/`, tính từ gốc repo)
 * @param {{ force?: boolean }} [options] force = push vào main hoặc nhãn ci-full
 * @returns {{ database: boolean, e2e: boolean, python: boolean }}
 */
export function decideJobs(paths, { force = false } = {}) {
  const files = paths.map((p) => p.trim().replaceAll('\\', '/')).filter(Boolean);
  if (force || files.length === 0) return { ...ALL };

  const result = { ...NONE };
  for (const file of files) {
    const rule = isSharedFile(file) ? ALL : rulesFor(file);
    if (rule === null) return { ...ALL };
    result.database ||= rule.database;
    result.e2e ||= rule.e2e;
    result.python ||= rule.python;
  }
  return result;
}

/** Sự kiện/nhãn buộc chạy đủ. */
export function mustRunAll({ eventName, labels }) {
  return eventName !== 'pull_request' || labels.includes('ci-full');
}

function changedFiles(baseRef) {
  const out = execFileSync('git', ['diff', '--name-only', `origin/${baseRef}...HEAD`], {
    encoding: 'utf8',
  });
  return out.split('\n');
}

function main() {
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const baseRef = process.env.BASE_REF ?? 'main';
  let jobs;
  try {
    const labels = JSON.parse(process.env.PR_LABELS || '[]') ?? [];
    const force = mustRunAll({ eventName, labels });
    jobs = decideJobs(force ? [] : changedFiles(baseRef), { force });
  } catch (error) {
    // Lỗi lấy danh sách file → chạy hết (không để job nặng bị bỏ qua vì lỗi của chính bước lọc).
    console.error(`ci-changes: lỗi (${error.message}); chạy hết.`);
    jobs = { ...ALL };
  }
  const lines = ['node=true', ...Object.entries(jobs).map(([k, v]) => `${k}=${v}`)];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

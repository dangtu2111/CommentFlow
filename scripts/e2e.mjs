// `pnpm e2e [-- <tham số playwright>]`: migrate DB test → khởi động web → chờ /api/health → playwright test → tắt web.
// Biến: E2E_PORT (mặc định: tự chọn cổng trống), E2E_WEB_MODE=start|dev (mặc định start = next build + next start),
// E2E_SKIP_BUILD=1 (dùng lại bản build cũ), CF_LANE (DB cf_test_<làn>). Xem scripts/lib/e2e-env.mjs.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildE2eEnv } from './lib/e2e-env.mjs';
import { loadRepoEnv } from './lib/load-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const isWindows = process.platform === 'win32';
const HEALTH_TIMEOUT_MS = 180_000;

function fail(message) {
  console.error(`[e2e] ${message}`);
  process.exit(1);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Chromium của Playwright đã cài chưa (không tải gì; chỉ nhìn thư mục cache). */
function chromiumInstalled() {
  const custom = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const dir =
    custom && custom !== '0'
      ? custom
      : isWindows
        ? join(process.env.LOCALAPPDATA ?? homedir(), 'ms-playwright')
        : process.platform === 'darwin'
          ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
          : join(homedir(), '.cache', 'ms-playwright');
  return existsSync(dir) && readdirSync(dir).some((name) => name.startsWith('chromium'));
}

/** Chạy lệnh một lần, in output trực tiếp; trả về mã thoát. */
function run(command, env) {
  const result = spawnSync(command, { cwd: root, env, stdio: 'inherit', shell: true });
  return result.status ?? 1;
}

function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (isWindows) spawnSync(`taskkill /pid ${child.pid} /T /F`, { shell: true, stdio: 'ignore' });
  else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`Web thoát sớm (mã ${child.exitCode}); xem log ở trên.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // chưa nghe cổng: chờ tiếp
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`Web không sẵn sàng sau ${HEALTH_TIMEOUT_MS / 1000} giây (${url}).`);
}

async function assertMailpit(url) {
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/api/v1/info`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    fail(`Không với tới Mailpit (MAILPIT_URL): ${error.message}. Bật máy ảo cf-dev rồi chạy lại.`);
  }
}

loadRepoEnv(root);
const port = Number(process.env.E2E_PORT) || (await freePort());
let env;
try {
  env = buildE2eEnv(process.env, { port, lane: process.env.CF_LANE });
} catch (error) {
  fail(error.message);
}
if (!chromiumInstalled()) {
  fail(
    'Chưa cài Chromium cho Playwright. Chạy một lần: pnpm --filter @flow/e2e exec playwright install chromium',
  );
}
await assertMailpit(env.MAILPIT_URL);

console.log('[e2e] Áp migration lên DB test…');
if (run('pnpm --filter @flow/db run db:migrate', env) !== 0) fail('Migration DB test thất bại.');

const mode = process.env.E2E_WEB_MODE === 'dev' ? 'dev' : 'start';
if (mode === 'start' && process.env.E2E_SKIP_BUILD !== '1') {
  console.log('[e2e] next build…');
  if (run('pnpm --filter @flow/web run build', { ...env, NODE_ENV: 'production' }) !== 0) {
    fail('next build thất bại.');
  }
}

console.log(`[e2e] Khởi động web (${mode}) ở cổng ${port}…`);
const webCommand =
  mode === 'dev'
    ? `pnpm --filter @flow/web exec next dev -p ${port}`
    : `pnpm --filter @flow/web exec next start -p ${port}`;
const web = spawn(webCommand, {
  cwd: root,
  env: mode === 'dev' ? env : { ...env, NODE_ENV: 'production' },
  stdio: 'inherit',
  shell: true,
  detached: !isWindows,
});

const stop = () => killTree(web);
process.on('exit', stop);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stop();
    process.exit(130);
  });
}

let code = 1;
try {
  await waitForHealth(`${env.E2E_BASE_URL}/api/health`, web);
  const extra = process.argv.slice(2).join(' ');
  code = run(`pnpm --filter @flow/e2e exec playwright test ${extra}`.trim(), env);
} finally {
  stop();
}
process.exit(code);

// Bản thật của các giao diện gh / git / agent / file. Chỉ dùng stdlib Node.
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeGit } from './safe-git.mjs';

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');

function exec(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout,
        stderr,
      });
    });
  });
}

export function createGh(config) {
  const repo = ['--repo', config.repo];
  const json = async (args) => {
    const r = await exec('gh', args);
    if (r.code !== 0 && !r.stdout.trim()) {
      // `gh pr checks` thoát mã 8 khi còn check pending nhưng vẫn in JSON; chỉ báo lỗi khi không có gì.
      if (/no checks reported/i.test(r.stderr)) return [];
      throw new Error(`gh ${args.slice(0, 2).join(' ')}: ${r.stderr.trim()}`);
    }
    return JSON.parse(r.stdout || '[]');
  };
  return {
    async findPr(branch) {
      const list = await json([
        'pr',
        'list',
        ...repo,
        '--head',
        branch,
        '--state',
        'all',
        '--json',
        'number,headRefName,state',
        '--limit',
        '10',
      ]);
      const exact = list.filter((p) => p.headRefName === branch);
      return exact.find((p) => p.state === 'OPEN') ?? exact[0] ?? null;
    },
    listOpenPrs: () =>
      json([
        'pr',
        'list',
        ...repo,
        '--state',
        'open',
        '--json',
        'number,headRefName,headRefOid,createdAt,isDraft',
        '--limit',
        '100',
      ]),
    async prView(number) {
      const v = await json([
        'pr',
        'view',
        String(number),
        ...repo,
        '--json',
        'state,mergeable,headRefName,headRefOid',
      ]);
      return {
        state: v.state,
        mergeable: v.mergeable,
        headRefName: v.headRefName,
        headSha: v.headRefOid,
      };
    },
    prChecks: (number) =>
      json(['pr', 'checks', String(number), ...repo, '--json', 'name,bucket,state']),
    async merge(number, method) {
      const r = await exec('gh', ['pr', 'merge', String(number), ...repo, `--${method}`]);
      return { ok: r.code === 0, message: r.stderr.trim() };
    },
  };
}

export function createGit(config) {
  const run = (cwd, args) => exec('git', assertSafeGit(args), cwd);
  return {
    // Chuẩn bị nhánh trong worktree của làn. Không ép, không ghi đè; worktree bẩn → dừng.
    async prepare({ dir, branch, base }) {
      if (!existsSync(dir)) {
        await run(config.baseDir, ['fetch', 'origin']);
        const add = await run(config.baseDir, [
          'worktree',
          'add',
          '--detach',
          dir,
          `origin/${base}`,
        ]);
        if (add.code !== 0) throw new Error(`không tạo được worktree ${dir}: ${add.stderr.trim()}`);
      }
      const dirty = await run(dir, ['status', '--porcelain']);
      if (dirty.stdout.trim() !== '')
        throw new Error(`worktree ${dir} đang có thay đổi chưa commit`);
      await run(dir, ['fetch', 'origin']);
      const has = async (ref) =>
        (await run(dir, ['rev-parse', '--verify', '--quiet', ref])).code === 0;
      let res;
      if (await has(`refs/heads/${branch}`)) res = await run(dir, ['checkout', branch]);
      else if (await has(`refs/remotes/origin/${branch}`)) {
        res = await run(dir, ['checkout', '-b', branch, `origin/${branch}`]);
      } else res = await run(dir, ['checkout', '-b', branch, `origin/${base}`]);
      if (res.code !== 0) throw new Error(`checkout ${branch} lỗi: ${res.stderr.trim()}`);
    },
  };
}

export function createAgent(config, logger) {
  const a = config.agent;
  return {
    run({ dir, model, prompt }) {
      const args = [
        '-p',
        '--model',
        model,
        '--allowedTools',
        a.allowedTools.join(','),
        '--disallowedTools',
        a.disallowedTools.join(','),
      ];
      return new Promise((resolve) => {
        const child = spawn(a.command, args, {
          cwd: dir,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (d) => {
          output += d;
        });
        child.stderr.on('data', (d) => logger.log(`agent stderr: ${String(d).trim()}`));
        const timer = setTimeout(() => child.kill(), a.maxMinutes * 60_000);
        child.on('error', (e) => {
          clearTimeout(timer);
          resolve({ code: 1, output: `${output}\n${e.message}` });
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ code: code ?? 1, output });
        });
        child.stdin.end(prompt);
      });
    },
  };
}

export function createFiles(config) {
  const marker = (name) => join(config.stateDir, name);
  const templates = new Map();
  return {
    readText(path) {
      return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    },
    // Template ưu tiên bản của dự án (promptDir/_templates/<tên>.md), rồi tới bản mặc định của bộ công cụ.
    template(name) {
      if (!templates.has(name)) {
        const own = join(config.promptDir, '_templates', `${name}.md`);
        templates.set(
          name,
          readFileSync(existsSync(own) ? own : join(TEMPLATE_DIR, `${name}.md`), 'utf8'),
        );
      }
      return templates.get(name);
    },
    hasMarker: (name) => existsSync(marker(name)),
    readMarker: (name) =>
      existsSync(marker(name)) ? readFileSync(marker(name), 'utf8').trim() : undefined,
    setMarker(name, content = new Date().toISOString()) {
      mkdirSync(config.stateDir, { recursive: true });
      writeFileSync(marker(name), content);
    },
    clearMarker: (name) => rmSync(marker(name), { force: true }),
  };
}

export const realClock = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

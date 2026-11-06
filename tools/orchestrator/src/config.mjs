// Đọc + kiểm tra orchestrator.config.json. Mọi thứ riêng của dự án nằm ở file này, không cứng trong mã.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEFAULT_DISALLOWED_TOOLS = [
  'Bash(git push --force:*)',
  'Bash(git push -f:*)',
  'Bash(git push --force-with-lease:*)',
  'Bash(git rebase:*)',
  'Bash(git add -A:*)',
  'Bash(git add --all:*)',
  'Bash(git add .:*)',
  'Bash(git reset --hard:*)',
];

export const DEFAULTS = {
  baseBranch: 'main',
  branchPrefix: 'feat/',
  stateDir: '.orchestrator',
  promptDir: 'orchestrator/prompts',
  verifyCommands: [],
  maxFixesPerPr: 2,
  rootCauseThreshold: 0.8,
  merge: { method: 'squash' },
  ci: {
    pollSeconds: 30,
    timeoutMinutes: 45,
    noChecksGraceSeconds: 120,
    requireChecks: true,
    ignoreChecks: [],
  },
  agent: {
    command: 'claude',
    defaultModel: 'sonnet',
    allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
    disallowedTools: DEFAULT_DISALLOWED_TOOLS,
    maxMinutes: 120,
  },
  log: { format: 'text' },
  // Làn gỡ kẹt: janitor dùng worktree của làn này để sửa PR mồ côi (lane = null → chỉ kiểm nhịp tim).
  janitor: { lane: null, intervalMinutes: 10, minAgeMinutes: 30, trackTtlMinutes: 15 },
  heartbeat: { intervalMinutes: 5, silentMinutes: 15 },
};

function mergeSection(base, over) {
  return { ...base, ...(over ?? {}) };
}

export function validateConfig(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return ['Config phải là một đối tượng JSON'];
  if (typeof raw.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(raw.repo)) {
    errors.push('repo: cần dạng "chủ/tên-repo"');
  }
  if (!raw.lanes || typeof raw.lanes !== 'object' || Object.keys(raw.lanes).length === 0) {
    errors.push('lanes: cần ít nhất một làn');
  } else {
    for (const [name, lane] of Object.entries(raw.lanes)) {
      if (!/^[A-Za-z0-9_-]+$/.test(name)) errors.push(`lanes.${name}: tên làn không hợp lệ`);
      if (!lane || typeof lane.dir !== 'string' || lane.dir === '') {
        errors.push(`lanes.${name}.dir: cần thư mục worktree`);
      }
    }
  }
  if (raw.branchPrefix !== undefined && typeof raw.branchPrefix !== 'string') {
    errors.push('branchPrefix: cần chuỗi');
  }
  if (
    raw.maxFixesPerPr !== undefined &&
    !(Number.isInteger(raw.maxFixesPerPr) && raw.maxFixesPerPr >= 0)
  ) {
    errors.push('maxFixesPerPr: cần số nguyên >= 0');
  }
  const method = raw.merge?.method;
  if (method !== undefined && !['squash', 'merge', 'rebase'].includes(method)) {
    errors.push('merge.method: squash | merge | rebase');
  }
  const fmt = raw.log?.format;
  if (fmt !== undefined && !['text', 'json'].includes(fmt)) errors.push('log.format: text | json');
  const jl = raw.janitor?.lane;
  if (jl !== undefined && jl !== null && !raw.lanes?.[jl]) {
    errors.push(`janitor.lane: làn "${jl}" không có trong lanes`);
  }
  return errors;
}

// Trả về config đã gộp mặc định; thư mục tương đối tính từ vị trí file config.
export function resolveConfig(raw, baseDir) {
  const errors = validateConfig(raw);
  if (errors.length > 0) throw new Error(`orchestrator.config.json sai:\n- ${errors.join('\n- ')}`);
  const lanes = Object.fromEntries(
    Object.entries(raw.lanes).map(([name, lane]) => [
      name,
      { ...lane, dir: resolve(baseDir, lane.dir) },
    ]),
  );
  return {
    ...DEFAULTS,
    ...raw,
    lanes,
    merge: mergeSection(DEFAULTS.merge, raw.merge),
    ci: mergeSection(DEFAULTS.ci, raw.ci),
    agent: mergeSection(DEFAULTS.agent, raw.agent),
    log: mergeSection(DEFAULTS.log, raw.log),
    janitor: mergeSection(DEFAULTS.janitor, raw.janitor),
    heartbeat: mergeSection(DEFAULTS.heartbeat, raw.heartbeat),
    baseDir,
    stateDir: resolve(baseDir, raw.stateDir ?? DEFAULTS.stateDir),
    promptDir: resolve(baseDir, raw.promptDir ?? DEFAULTS.promptDir),
  };
}

export function loadConfig(path) {
  const file = resolve(path);
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Không đọc được ${file}: ${e.message}`);
  }
  return resolveConfig(raw, dirname(file));
}

export function modelFor(config, laneName, step) {
  return step.model ?? config.lanes[laneName].model ?? config.agent.defaultModel;
}

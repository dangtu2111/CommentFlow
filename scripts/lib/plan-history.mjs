import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

/**
 * Tên các file trong docs/plans/ từng được THÊM trong lịch sử `base..HEAD` (kể cả đã bị xóa sau đó).
 * @param {string} base ví dụ 'origin/main'
 * @param {string} [cwd]
 * @returns {string[] | null} null nếu không đọc được (không có `base`, clone nông, không phải repo git)
 */
export function plansAddedSince(base, cwd = process.cwd()) {
  try {
    const out = execFileSync(
      'git',
      [
        'log',
        `${base}..HEAD`,
        '--diff-filter=A',
        '--name-only',
        '--pretty=format:',
        '--',
        'docs/plans/',
      ],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((path) => basename(path));
  } catch {
    return null;
  }
}

/** Nhánh hiện tại: biến của GitHub Actions (PR → GITHUB_HEAD_REF, push → GITHUB_REF_NAME), nếu không thì hỏi git. */
export function currentBranch(env = process.env, cwd = process.cwd()) {
  const fromCi = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
  if (fromCi) return fromCi;
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkBranchPlan } from './plan-gate.mjs';
import { currentBranch, plansAddedSince } from './plan-history.mjs';

let repo;
const git = (...args) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const commit = (message) => {
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '-m', message);
};

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'cf-plan-'));
  git('init', '-q', '-b', 'main');
  mkdirSync(join(repo, 'docs/plans'), { recursive: true });
  writeFileSync(join(repo, 'docs/plans/README.md'), '# plans\n');
  commit('khởi tạo');
  git('branch', 'base'); // mốc "main" của phép thử
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('plansAddedSince + currentBranch (repo git tạm)', () => {
  it('nhánh feat/* thêm plan rồi XÓA plan ở commit kết thúc → vẫn thấy plan từng được thêm → đạt', () => {
    git('checkout', '-q', '-b', 'feat/x', 'base');
    writeFileSync(join(repo, 'docs/plans/feat-x.md'), '# plan\n');
    writeFileSync(join(repo, 'code.txt'), '1\n');
    commit('plan + code');
    rmSync(join(repo, 'docs/plans/feat-x.md'));
    commit('xong: xóa plan');

    expect(currentBranch({}, repo)).toBe('feat/x');
    const added = plansAddedSince('base', repo);
    expect(added).toEqual(['feat-x.md']);
    expect(checkBranchPlan({ branch: 'feat/x', existingPlans: [], addedPlans: added })).toEqual([]);
  });

  it('nhánh chore/* chỉ đổi code, chưa từng thêm plan → đỏ', () => {
    git('checkout', '-q', '-b', 'chore/khong-plan', 'base');
    writeFileSync(join(repo, 'code2.txt'), '2\n');
    commit('chỉ code');
    const added = plansAddedSince('base', repo);
    expect(added).toEqual([]);
    expect(
      checkBranchPlan({ branch: 'chore/khong-plan', existingPlans: [], addedPlans: added }),
    ).toHaveLength(1);
  });

  it('commit MERGE kiểu PR (refs/pull/N/merge) không làm Git ẩn nhánh đã thêm rồi xóa plan', () => {
    // Mô phỏng CI của pull_request: HEAD là commit merge của main + nhánh; cây docs/plans của merge trùng main
    // (plan đã xóa) nên mặc định Git "đơn giản hóa lịch sử" và bỏ qua cả nhánh. Phải dùng --full-history.
    git('checkout', '-q', '-b', 'feat/pr', 'base');
    writeFileSync(join(repo, 'docs/plans/feat-pr.md'), '# plan\n');
    commit('thêm plan');
    rmSync(join(repo, 'docs/plans/feat-pr.md'));
    writeFileSync(join(repo, 'pr-code.txt'), 'x\n');
    commit('xong: xóa plan');
    git('checkout', '-q', 'base');
    git('checkout', '-q', '-b', 'main-moved', 'base');
    writeFileSync(join(repo, 'main-change.txt'), 'm\n');
    commit('main tiến thêm');
    git('checkout', '-q', '-b', 'pr-merge', 'main-moved');
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.test',
      'merge',
      '--no-ff',
      '-q',
      '-m',
      'merge pr',
      'feat/pr',
    );
    expect(plansAddedSince('main-moved', repo)).toEqual(['feat-pr.md']);
  });

  it('nhánh fix/* không có plan → được miễn', () => {
    git('checkout', '-q', '-b', 'fix/nho', 'base');
    writeFileSync(join(repo, 'code3.txt'), '3\n');
    commit('sửa nhỏ');
    const added = plansAddedSince('base', repo);
    expect(checkBranchPlan({ branch: 'fix/nho', existingPlans: [], addedPlans: added })).toEqual(
      [],
    );
  });

  it('base không tồn tại (clone nông / thiếu origin/main) → null, không báo lỗi oan', () => {
    expect(plansAddedSince('origin/khong-co', repo)).toBeNull();
    expect(checkBranchPlan({ branch: 'feat/x', existingPlans: [], addedPlans: null })).toEqual([]);
  });

  it('biến của GitHub Actions thắng git: PR dùng GITHUB_HEAD_REF, push dùng GITHUB_REF_NAME', () => {
    expect(currentBranch({ GITHUB_HEAD_REF: 'feat/a', GITHUB_REF_NAME: '12/merge' }, repo)).toBe(
      'feat/a',
    );
    expect(currentBranch({ GITHUB_REF_NAME: 'chore/b' }, repo)).toBe('chore/b');
  });
});

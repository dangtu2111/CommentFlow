import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.mjs';
import { driveToMerge, runLane } from '../src/runner.mjs';
import { parseSteps } from '../src/steps.mjs';

const TPL = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const config = resolveConfig(
  {
    repo: 'o/r',
    verifyCommands: ['pnpm test'],
    ci: { pollSeconds: 1, timeoutMinutes: 5, noChecksGraceSeconds: 5 },
    lanes: { a: { dir: '/w/a', testDb: 'db_a', migration: true }, b: { dir: '/w/b' } },
  },
  '/w',
);

// Giả lập gh theo kịch bản: mỗi PR có chuỗi "pha" (CI thế nào, xung đột không) và trạng thái đầu PR.
function fakeWorld({ phases, prs = { 'feat/t1': 7 }, agentOutputs = [] }) {
  const state = {
    phase: 0,
    merged: false,
    sha: 'sha0',
    alerts: [],
    logs: [],
    prompts: [],
    marks: new Set(),
    merges: [],
  };
  let outIdx = 0;
  const phase = () => phases[Math.min(state.phase, phases.length - 1)];
  const deps = {
    gh: {
      findPr: async (branch) => (prs[branch] ? { number: prs[branch], headRefName: branch } : null),
      prView: async () => ({
        state: state.merged ? 'MERGED' : 'OPEN',
        mergeable: phase().conflict ? 'CONFLICTING' : 'MERGEABLE',
        headRefName: 'feat/t1',
        headSha: state.sha,
      }),
      prChecks: async () => phase().checks.map((bucket, i) => ({ name: `c${i}`, bucket })),
      merge: async (n, method) => {
        state.merges.push([n, method]);
        state.merged = true;
        return { ok: true, message: '' };
      },
    },
    git: { prepare: async () => {} },
    agent: {
      run: async ({ prompt, model }) => {
        state.prompts.push({ prompt, model });
        if (state.prompts.length > 1) {
          // agent sửa: đẩy commit mới và sang pha kế
          state.phase += 1;
          state.sha = `sha${state.phase}`;
        }
        return { code: 0, output: agentOutputs[outIdx++] ?? '' };
      },
    },
    logger: {
      log: (m) => state.logs.push(m),
      alert: (type, msg) => state.alerts.push([type, msg]),
    },
    readText: (p) => (p.endsWith('t1.md') ? 'Làm việc T1.' : undefined),
    template: (name) => readFileSync(join(TPL, `${name}.md`), 'utf8'),
    hasMarker: (m) => state.marks.has(m),
    setMarker: (m) => state.marks.add(m),
    clearMarker: (m) => state.marks.delete(m),
    sleep: async () => {},
    now: (() => {
      let t = 0;
      return () => (t += 1000);
    })(),
  };
  return { deps, state };
}

describe('runLane', () => {
  it('task → PR tìm theo tên nhánh → CI xanh → merge → cảnh báo MERGED + HẾT HÀNG ĐỢI', async () => {
    const { deps, state } = fakeWorld({ phases: [{ checks: ['pending'] }, { checks: ['pass'] }] });
    let polls = 0;
    const origChecks = deps.gh.prChecks;
    deps.gh.prChecks = async (n) =>
      polls++ < 1 ? [{ name: 'c', bucket: 'pending' }] : origChecks(n);
    state.phase = 1;
    const r = await runLane({ config, laneName: 'a', steps: parseSteps(['task:t1@fable']), deps });
    expect(r.status).toBe('done');
    expect(state.merges).toEqual([[7, 'squash']]);
    expect(state.alerts.map((a) => a[0])).toEqual(['MERGED', 'HẾT HÀNG ĐỢI']);
    expect(state.prompts[0].model).toBe('fable');
    expect(state.prompts[0].prompt).toContain('Làm việc T1.');
    expect(state.prompts[0].prompt).toContain('Làn migration');
    expect(state.prompts[0].prompt).toContain('db_a');
    expect(state.marks.has('a.done')).toBe(true);
  });

  it('CI đỏ → sửa (prompt ci-fix) → xanh → merge; dùng mô hình mặc định của làn', async () => {
    const { deps, state } = fakeWorld({
      phases: [{ checks: ['fail'] }, { checks: ['pass'] }],
      agentOutputs: ['', 'NGUYÊN NHÂN GỐC: thiếu import'],
    });
    const r = await runLane({ config, laneName: 'b', steps: parseSteps(['task:t1']), deps });
    expect(r.status).toBe('done');
    expect(state.prompts).toHaveLength(2);
    expect(state.prompts[1].prompt).toContain('lần sửa 1/2');
    expect(state.prompts[0].prompt).not.toContain('Làn migration');
    expect(state.merges).toHaveLength(1);
  });

  it('đỏ mãi: sửa đúng 2 lần rồi KẸT (không sửa lần ba)', async () => {
    const { deps, state } = fakeWorld({
      phases: [{ checks: ['fail'] }],
      agentOutputs: ['', 'NGUYÊN NHÂN GỐC: A', 'NGUYÊN NHÂN GỐC: hoàn toàn khác B'],
    });
    const r = await runLane({ config, laneName: 'a', steps: parseSteps(['task:t1']), deps });
    expect(r.status).toBe('stuck');
    expect(state.prompts).toHaveLength(3); // 1 task + 2 sửa
    expect(state.alerts.at(-1)[0]).toBe('KẸT');
    expect(state.marks.has('a.stuck')).toBe(true);
    expect(state.marks.has('a.done')).toBe(false);
  });

  it('lặp cùng NGUYÊN NHÂN GỐC → KẸT ngay sau lần sửa thứ hai', async () => {
    const { deps, state } = fakeWorld({
      phases: [{ checks: ['fail'] }],
      agentOutputs: ['', 'NGUYÊN NHÂN GỐC: thiếu import X', 'NGUYÊN NHÂN GỐC: Thiếu import X'],
    });
    const cfg = { ...config, maxFixesPerPr: 5 };
    const r = await runLane({ config: cfg, laneName: 'a', steps: parseSteps(['task:t1']), deps });
    expect(r.status).toBe('stuck');
    expect(state.alerts.at(-1)[1]).toContain('NGUYÊN NHÂN GỐC');
    expect(state.prompts).toHaveLength(3);
  });

  it('xung đột → prompt gỡ xung đột (không rebase)', async () => {
    const { deps, state } = fakeWorld({
      phases: [{ checks: [], conflict: true }, { checks: ['pass'] }],
      agentOutputs: ['', 'NGUYÊN NHÂN GỐC: số migration trùng'],
    });
    const r = await runLane({ config, laneName: 'a', steps: parseSteps(['task:t1']), deps });
    expect(r.status).toBe('done');
    expect(state.prompts[1].prompt).toContain('xung đột');
    expect(state.prompts[1].prompt).toContain('không rebase');
  });

  it('không có PR → KẸT; agent thoát lỗi → KẸT', async () => {
    const none = fakeWorld({ phases: [{ checks: ['pass'] }], prs: {} });
    expect(
      (await runLane({ config, laneName: 'a', steps: parseSteps(['task:t1']), deps: none.deps }))
        .status,
    ).toBe('stuck');
    const failing = fakeWorld({ phases: [{ checks: ['pass'] }] });
    failing.deps.agent.run = async () => ({ code: 3, output: '' });
    const r = await runLane({
      config,
      laneName: 'a',
      steps: parseSteps(['task:t1']),
      deps: failing.deps,
    });
    expect(r).toEqual({ status: 'stuck', reason: 'agent thoát mã 3' });
  });

  it('PR tìm thấy qua biến thể "-" của tên nhánh', async () => {
    const { deps, state } = fakeWorld({ phases: [{ checks: ['pass'] }], prs: { 'feat-t1': 9 } });
    const r = await runLane({ config, laneName: 'a', steps: parseSteps(['task:t1']), deps });
    expect(r.status).toBe('done');
    expect(state.merges[0][0]).toBe(9);
  });

  it('fix:<pr> chạy thẳng vòng sửa/merge; không có PR task', async () => {
    const { deps, state } = fakeWorld({ phases: [{ checks: ['pass'] }] });
    const r = await runLane({ config, laneName: 'a', steps: parseSteps(['fix:7']), deps });
    expect(r.status).toBe('done');
    expect(state.prompts).toHaveLength(0);
  });

  it('sửa xong mà không có commit mới → KẸT (stale); agent sửa lỗi thoát ≠ 0 → KẸT', async () => {
    const { deps, state } = fakeWorld({ phases: [{ checks: ['fail'] }] });
    deps.agent.run = async ({ prompt }) => {
      state.prompts.push({ prompt });
      return { code: 0, output: '' };
    };
    const r = await driveToMerge({
      config,
      laneName: 'a',
      pr: 7,
      branch: 'feat/t1',
      model: 'sonnet',
      deps,
    });
    expect(r.status).toBe('stuck');
    expect(r.reason).toContain('không có commit mới');
    const bad = fakeWorld({ phases: [{ checks: ['fail'] }] });
    bad.deps.agent.run = async () => ({ code: 2, output: '' });
    expect(
      (
        await driveToMerge({
          config,
          laneName: 'a',
          pr: 7,
          branch: 'feat/t1',
          model: 'sonnet',
          deps: bad.deps,
        })
      ).reason,
    ).toContain('mã 2');
  });

  it('wait:<làn> chờ marker .done; làn kia KẸT thì dừng; làn lạ thì KẸT', async () => {
    const { deps, state } = fakeWorld({ phases: [{ checks: ['pass'] }] });
    let n = 0;
    deps.sleep = async () => {
      if (++n === 2) state.marks.add('b.done');
    };
    const ok = await runLane({ config, laneName: 'a', steps: parseSteps(['wait:b']), deps });
    expect(ok.status).toBe('done');
    expect(n).toBe(2);
    state.marks.clear();
    state.marks.add('b.stuck');
    expect(
      (await runLane({ config, laneName: 'a', steps: parseSteps(['wait:b']), deps })).status,
    ).toBe('stuck');
    expect(
      (await runLane({ config, laneName: 'a', steps: parseSteps(['wait:zz']), deps })).status,
    ).toBe('stuck');
  });

  it('merge bị từ chối → KẸT; PR đã đóng → KẸT', async () => {
    const { deps } = fakeWorld({ phases: [{ checks: ['pass'] }] });
    deps.gh.merge = async () => ({ ok: false, message: 'blocked' });
    expect(
      (await driveToMerge({ config, laneName: 'a', pr: 7, branch: 'b', model: 's', deps })).reason,
    ).toContain('blocked');
    const closed = fakeWorld({ phases: [{ checks: ['pass'] }] });
    closed.deps.gh.prView = async () => ({ state: 'CLOSED', mergeable: 'UNKNOWN', headSha: 'x' });
    expect(
      (
        await driveToMerge({
          config,
          laneName: 'a',
          pr: 7,
          branch: 'b',
          model: 's',
          deps: closed.deps,
        })
      ).status,
    ).toBe('stuck');
  });
});

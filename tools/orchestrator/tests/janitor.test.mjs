import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.mjs';
import { decidePr, isSafeToMerge } from '../src/decide.mjs';
import { findSilentLanes, isFresh, startHeartbeat } from '../src/heartbeat.mjs';
import { FREEZE_MARKER, runJanitorOnce, selectOrphanPrs } from '../src/janitor.mjs';

const MIN = 60_000;
const NOW = Date.parse('2026-11-06T10:00:00Z');
const iso = (minutesAgo) => new Date(NOW - minutesAgo * MIN).toISOString();

describe('isFresh', () => {
  it('mới trong hạn → true; quá hạn/rỗng/rác → false', () => {
    expect(isFresh(iso(5), NOW, 15 * MIN)).toBe(true);
    expect(isFresh(iso(16), NOW, 15 * MIN)).toBe(false);
    expect(isFresh(undefined, NOW, 15 * MIN)).toBe(false);
    expect(isFresh('rác', NOW, 15 * MIN)).toBe(false);
  });
});

describe('selectOrphanPrs', () => {
  const base = { now: NOW, minAgeMs: 30 * MIN, ttlMs: 15 * MIN };
  const pr = (number, ageMin, extra = {}) => ({
    number,
    headRefName: `feat/p${number}`,
    headRefOid: `sha${number}`,
    createdAt: iso(ageMin),
    isDraft: false,
    ...extra,
  });

  it('chỉ lấy PR mở > 30 phút và không có tiến trình theo dõi còn hạn', () => {
    const prs = [pr(1, 10), pr(2, 45), pr(3, 90), pr(4, 90)];
    const tracking = { 3: iso(2), 4: iso(40) }; // 3 đang được theo dõi; 4 dấu đã chết
    const got = selectOrphanPrs({
      ...base,
      prs,
      trackingOf: (n) => tracking[n],
      stuckOf: () => undefined,
    });
    expect(got.map((p) => p.number)).toEqual([2, 4]);
  });

  it('bỏ PR nháp', () => {
    const got = selectOrphanPrs({
      ...base,
      prs: [pr(1, 99, { isDraft: true })],
      trackingOf: () => undefined,
      stuckOf: () => undefined,
    });
    expect(got).toEqual([]);
  });

  it('bỏ PR đã KẸT ở đúng commit đó; commit mới thì thử lại', () => {
    const stuck = { 5: 'sha5', 6: 'cu' };
    const got = selectOrphanPrs({
      ...base,
      prs: [pr(5, 99), pr(6, 99)],
      trackingOf: () => undefined,
      stuckOf: (n) => stuck[n],
    });
    expect(got.map((p) => p.number)).toEqual([6]);
  });
});

describe('findSilentLanes', () => {
  const args = { now: NOW, silentMs: 15 * MIN };
  it('làn đang chạy mà tim ngừng > 15 phút → báo; làn khỏe/đã xong/chưa từng chạy → không', () => {
    const heartbeats = { a: iso(20), b: iso(3), c: iso(60), d: undefined };
    const finished = new Set(['c']);
    const got = findSilentLanes({
      ...args,
      lanes: ['a', 'b', 'c', 'd'],
      heartbeatOf: (l) => heartbeats[l],
      isFinished: (l) => finished.has(l),
    });
    expect(got).toEqual([{ lane: 'a', silentMinutes: 20, ts: iso(20) }]);
  });
});

describe('startHeartbeat', () => {
  it('ghi ngay một nhịp, mỗi chu kỳ một nhịp, dừng được', () => {
    const writes = [];
    const logs = [];
    let tick;
    let cleared = false;
    const stop = startHeartbeat({
      lane: 'a',
      intervalMs: 5 * MIN,
      write: (name, text) => writes.push([name, text]),
      log: (m) => logs.push(m),
      nowIso: () => 'T',
      setIntervalFn: (fn, ms) => {
        tick = fn;
        expect(ms).toBe(5 * MIN);
        return 1;
      },
      clearIntervalFn: () => {
        cleared = true;
      },
    });
    expect(writes).toEqual([['a.heartbeat', 'T']]);
    tick();
    expect(writes).toHaveLength(2);
    expect(logs).toHaveLength(2);
    stop();
    expect(cleared).toBe(true);
  });
});

describe('khóa merge + chờ CI đủ (decide)', () => {
  const open = { state: 'OPEN', mergeable: 'MERGEABLE' };
  const common = { fixes: 0, maxFixes: 2, repeatedCause: false };
  it('CI xanh nhưng đang khóa → chờ, không merge', () => {
    expect(decidePr({ view: open, checks: 'green', frozen: true, ...common })).toEqual({
      action: 'wait',
      reason: 'merge-freeze',
    });
  });
  it('khóa không chặn việc sửa/kẹt', () => {
    expect(decidePr({ view: open, checks: 'red', frozen: true, ...common }).action).toBe('fix');
  });
  it('không khóa → merge như cũ', () => {
    expect(decidePr({ view: open, checks: 'green', ...common }).action).toBe('merge');
  });
  it('còn check pending vẫn không đếm đỏ', () => {
    expect(decidePr({ view: open, checks: 'pending', ...common }).action).toBe('wait');
  });
  it('isSafeToMerge: chỉ xanh (hoặc không có check khi requireChecks=false)', () => {
    expect(isSafeToMerge('green', true)).toBe(true);
    expect(isSafeToMerge('pending', true)).toBe(false);
    expect(isSafeToMerge('red', true)).toBe(false);
    expect(isSafeToMerge('none', true)).toBe(false);
    expect(isSafeToMerge('none', false)).toBe(true);
  });
});

describe('runJanitorOnce', () => {
  const config = resolveConfig(
    {
      repo: 'o/r',
      ci: { pollSeconds: 1, timeoutMinutes: 5, noChecksGraceSeconds: 5 },
      janitor: { lane: 'j' },
      lanes: { a: { dir: '/w/a' }, j: { dir: '/w/j' } },
    },
    '/w',
  );

  function world({ prs, markers = {}, checks = ['pass'], frozen = false }) {
    const marks = new Map(Object.entries(markers));
    if (frozen) marks.set(FREEZE_MARKER, 'x');
    const state = { merges: [], alerts: [], logs: [], merged: new Set() };
    const deps = {
      gh: {
        listOpenPrs: async () => prs,
        findPr: async () => null,
        prView: async (n) => ({
          state: state.merged.has(n) ? 'MERGED' : 'OPEN',
          mergeable: 'MERGEABLE',
          headRefName: `feat/p${n}`,
          headSha: `sha${n}`,
        }),
        prChecks: async () => checks.map((bucket, i) => ({ name: `c${i}`, bucket })),
        merge: async (n) => {
          state.merges.push(n);
          state.merged.add(n);
          return { ok: true, message: '' };
        },
      },
      git: { prepare: async () => {} },
      agent: { run: async () => ({ code: 0, output: '' }) },
      logger: {
        log: (m) => state.logs.push(m),
        alert: (t, m) => state.alerts.push([t, m]),
      },
      template: () => '',
      readText: () => undefined,
      hasMarker: (m) => marks.has(m),
      readMarker: (m) => marks.get(m),
      setMarker: (m, c = 'x') => marks.set(m, c),
      clearMarker: (m) => marks.delete(m),
      sleep: async () => {},
      now: () => NOW,
    };
    return { deps, state, marks };
  }
  const orphan = (n) => ({
    number: n,
    headRefName: `feat/p${n}`,
    headRefOid: `sha${n}`,
    createdAt: iso(120),
    isDraft: false,
  });

  it('PR mồ côi CI xanh → land (merge) và dọn dấu theo dõi', async () => {
    const { deps, state, marks } = world({ prs: [orphan(9)] });
    const r = await runJanitorOnce({ config, deps });
    expect(state.merges).toEqual([9]);
    expect(r.landed).toEqual([9]);
    expect(marks.has('pr-9.tracking')).toBe(false);
  });

  it('CI xanh lúc chờ nhưng đỏ ngay trước khi merge → không merge', async () => {
    const cfg = resolveConfig(
      { repo: 'o/r', maxFixesPerPr: 0, janitor: { lane: 'j' }, lanes: { j: { dir: '/w/j' } } },
      '/w',
    );
    const { deps, state } = world({ prs: [orphan(9)] });
    let calls = 0;
    deps.gh.prChecks = async () => [{ name: 'c', bucket: ++calls === 1 ? 'pass' : 'fail' }];
    const r = await runJanitorOnce({ config: cfg, deps });
    expect(state.merges).toEqual([]);
    expect(r.stuck).toEqual([9]);
  });

  it('PR đang có driver theo dõi → không đụng', async () => {
    const { deps, state } = world({
      prs: [orphan(9)],
      markers: { 'pr-9.tracking': iso(1) },
    });
    await runJanitorOnce({ config, deps });
    expect(state.merges).toEqual([]);
  });

  it('khóa merge → không merge, PR vẫn chờ', async () => {
    const { deps, state } = world({ prs: [orphan(9)], frozen: true });
    const r = await runJanitorOnce({ config, deps });
    expect(state.merges).toEqual([]);
    expect(r.frozen).toBe(true);
  });

  it('CI đỏ hết lượt sửa → KẸT và ghi dấu để không lặp lại ở cùng commit', async () => {
    const cfg = resolveConfig(
      { repo: 'o/r', maxFixesPerPr: 0, janitor: { lane: 'j' }, lanes: { j: { dir: '/w/j' } } },
      '/w',
    );
    const { deps, state, marks } = world({ prs: [orphan(9)], checks: ['fail'] });
    await runJanitorOnce({ config: cfg, deps });
    expect(state.alerts.map((a) => a[0])).toContain('KẸT');
    expect(marks.get('pr-9.janitor-stuck')).toBe('sha9');
    state.alerts.length = 0;
    await runJanitorOnce({ config: cfg, deps });
    expect(state.alerts).toEqual([]);
  });

  it('làn im lặng > 15 phút → cảnh báo IM LẶNG một lần cho mỗi nhịp cũ', async () => {
    const { deps, state } = world({
      prs: [],
      markers: { 'a.heartbeat': iso(20) },
    });
    // 'now' thật của test là NOW
    await runJanitorOnce({ config, deps });
    await runJanitorOnce({ config, deps });
    const silent = state.alerts.filter((a) => a[0] === 'IM LẶNG');
    expect(silent).toHaveLength(1);
    expect(silent[0][1]).toContain('làn a');
  });
});

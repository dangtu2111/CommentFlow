import { describe, expect, it } from 'vitest';
import { branchCandidates, branchFor } from '../src/branches.mjs';
import { classifyChecks, failedCheckNames, waitForChecks } from '../src/checks.mjs';
import { DEFAULTS, modelFor, resolveConfig, validateConfig } from '../src/config.mjs';
import { decidePr } from '../src/decide.mjs';
import { formatAlert, formatLine } from '../src/logger.mjs';
import { extractRootCause, isRepeatedCause, sameCause } from '../src/root-cause.mjs';
import { assertSafeGit } from '../src/safe-git.mjs';
import { describeStep, parseStep, parseSteps } from '../src/steps.mjs';
import { bullets, renderTemplate } from '../src/templates.mjs';

describe('parseStep', () => {
  it('đọc task có/không mô hình, fix theo số PR, wait theo làn', () => {
    expect(parseStep('task:size-table')).toEqual({
      kind: 'task',
      name: 'size-table',
      model: undefined,
    });
    expect(parseStep('task:pii@opusplan')).toEqual({
      kind: 'task',
      name: 'pii',
      model: 'opusplan',
    });
    expect(parseStep('task:x@claude-fable-5-1')).toMatchObject({ model: 'claude-fable-5-1' });
    expect(parseStep('fix:97')).toEqual({ kind: 'fix', pr: 97, model: undefined });
    expect(parseStep('fix:#79@fable')).toEqual({ kind: 'fix', pr: 79, model: 'fable' });
    expect(parseStep('wait:b')).toEqual({ kind: 'wait', lane: 'b' });
  });

  it('từ chối bước sai: thiếu tiền tố, tên có "/", PR không phải số, mô hình lạ', () => {
    for (const bad of [
      'size-table',
      'task:a/b',
      'fix:abc',
      'task:x@bad model',
      'wait:a b',
      'run:x',
    ]) {
      expect(() => parseStep(bad)).toThrow(/Bước không hợp lệ/);
    }
  });

  it('parseSteps cần ít nhất một bước; describeStep in lại đúng dạng', () => {
    expect(() => parseSteps([])).toThrow(/ít nhất/);
    const steps = parseSteps(['task:a@sonnet', 'fix:3', 'wait:c']);
    expect(steps.map(describeStep)).toEqual(['task:a@sonnet', 'fix:3', 'wait:c']);
  });
});

describe('branches', () => {
  it('nhánh = tiền tố + tên; ứng viên tìm PR gồm biến thể "-" và tên trần, không trùng', () => {
    expect(branchFor('feat/', 'x')).toBe('feat/x');
    expect(branchCandidates('feat/', 'x')).toEqual(['feat/x', 'feat-x', 'x']);
    expect(branchCandidates('', 'x')).toEqual(['x']);
  });
});

describe('classifyChecks', () => {
  const c = (name, bucket) => ({ name, bucket });
  it('pending thắng red: chưa chờ xong thì chưa đếm đỏ', () => {
    expect(classifyChecks([c('a', 'fail'), c('b', 'pending')])).toBe('pending');
  });
  it('red khi có fail/cancel; green khi chỉ pass/skipping; none khi rỗng hoặc bị bỏ qua hết', () => {
    expect(classifyChecks([c('a', 'pass'), c('b', 'cancel')])).toBe('red');
    expect(classifyChecks([c('a', 'pass'), c('b', 'skipping')])).toBe('green');
    expect(classifyChecks([])).toBe('none');
    expect(classifyChecks([c('lint', 'fail')], ['lint'])).toBe('none');
  });
  it('failedCheckNames bỏ check được phép đỏ', () => {
    expect(failedCheckNames([c('a', 'fail'), c('b', 'fail'), c('c', 'pass')], ['b'])).toEqual([
      'a',
    ]);
  });
});

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
}
const ci = { pollSeconds: 10, timeoutMinutes: 5, noChecksGraceSeconds: 30 };

describe('waitForChecks', () => {
  it('đợi tới khi hết pending rồi mới trả kết quả (không trả sớm)', async () => {
    const seq = [
      [],
      [{ name: 'a', bucket: 'pending' }],
      [{ name: 'a', bucket: 'pending' }],
      [{ name: 'a', bucket: 'fail' }],
    ];
    let i = 0;
    const gh = { prChecks: async () => seq[Math.min(i++, seq.length - 1)] };
    const r = await waitForChecks({ gh, pr: 1, ignore: [], ci, ...clock() });
    expect(r.status).toBe('red');
    expect(i).toBe(4);
  });

  it('không có check nào quá thời gian ân hạn → none; chờ quá timeout → timeout', async () => {
    const none = await waitForChecks({
      gh: { prChecks: async () => [] },
      pr: 1,
      ignore: [],
      ci,
      ...clock(),
    });
    expect(none.status).toBe('none');
    const forever = await waitForChecks({
      gh: { prChecks: async () => [{ name: 'a', bucket: 'pending' }] },
      pr: 1,
      ignore: [],
      ci,
      ...clock(),
    });
    expect(forever.status).toBe('timeout');
  });

  it('sau bản sửa, bỏ qua kết quả cũ tới khi commit đầu PR đổi; không đổi → stale', async () => {
    let calls = 0;
    const gh = {
      prView: async () => ({ headSha: calls++ < 2 ? 'old' : 'new' }),
      prChecks: async () => [{ name: 'a', bucket: 'pass' }],
    };
    const ok = await waitForChecks({ gh, pr: 1, ignore: [], sinceSha: 'old', ci, ...clock() });
    expect(ok.status).toBe('green');
    const stale = await waitForChecks({
      gh: { prView: async () => ({ headSha: 'old' }), prChecks: async () => [] },
      pr: 1,
      ignore: [],
      sinceSha: 'old',
      ci,
      ...clock(),
    });
    expect(stale.status).toBe('stale');
  });
});

describe('root cause', () => {
  it('lấy dòng NGUYÊN NHÂN GỐC cuối cùng; không có → undefined', () => {
    expect(extractRootCause('xong\nNGUYÊN NHÂN GỐC: thiếu import\nPR: x')).toBe('thiếu import');
    expect(extractRootCause('NGUYÊN NHÂN GỐC: a\nNGUYÊN NHÂN GỐC: b')).toBe('b');
    expect(extractRootCause('không có')).toBeUndefined();
  });
  it('so gần giống bỏ dấu/hoa thường; khác hẳn thì không; thiếu thì không kết luận lặp', () => {
    expect(sameCause('Thiếu import ở file X', 'thieu IMPORT o file x')).toBe(true);
    expect(sameCause('thiếu import', 'số migration trùng')).toBe(false);
    expect(sameCause(undefined, 'a')).toBe(false);
    expect(sameCause('!!!', '???')).toBe(false);
    expect(isRepeatedCause(['a b c d e'], 'a b c d e')).toBe(true);
    expect(isRepeatedCause([], 'x')).toBe(false);
  });
});

describe('decidePr', () => {
  const base = {
    view: { state: 'OPEN', mergeable: 'MERGEABLE' },
    checks: 'green',
    fixes: 0,
    maxFixes: 2,
  };
  it('xanh + mergeable → merge; đã merge → done; đóng → kẹt', () => {
    expect(decidePr(base).action).toBe('merge');
    expect(decidePr({ ...base, view: { state: 'MERGED' } }).action).toBe('done');
    expect(decidePr({ ...base, view: { state: 'CLOSED' } }).action).toBe('stuck');
  });
  it('pending/UNKNOWN → chờ', () => {
    expect(decidePr({ ...base, checks: 'pending' }).action).toBe('wait');
    expect(decidePr({ ...base, view: { state: 'OPEN', mergeable: 'UNKNOWN' } }).action).toBe(
      'wait',
    );
  });
  it('đỏ → sửa ci tới giới hạn rồi kẹt; xung đột → sửa conflict kể cả khi CI chưa chạy', () => {
    expect(decidePr({ ...base, checks: 'red' })).toEqual({ action: 'fix', kind: 'ci' });
    expect(decidePr({ ...base, checks: 'red', fixes: 2 }).action).toBe('stuck');
    const conflict = {
      ...base,
      view: { state: 'OPEN', mergeable: 'CONFLICTING' },
      checks: 'pending',
    };
    expect(decidePr(conflict)).toEqual({ action: 'fix', kind: 'conflict' });
    expect(decidePr({ ...conflict, fixes: 2 }).action).toBe('stuck');
  });
  it('lặp nguyên nhân/quá hạn/stale/không có CI → kẹt (none tắt requireChecks thì merge)', () => {
    expect(decidePr({ ...base, checks: 'red', repeatedCause: true }).action).toBe('stuck');
    expect(decidePr({ ...base, checks: 'timeout' }).action).toBe('stuck');
    expect(decidePr({ ...base, checks: 'stale' }).action).toBe('stuck');
    expect(decidePr({ ...base, checks: 'none' }).action).toBe('stuck');
    expect(decidePr({ ...base, checks: 'none', requireChecks: false }).action).toBe('merge');
  });
});

describe('safe git', () => {
  it('cho phép lệnh đọc/chuẩn bị; cấm push, rebase, reset, add và cờ ép', () => {
    expect(() => assertSafeGit(['fetch', 'origin'])).not.toThrow();
    expect(() => assertSafeGit(['checkout', '-b', 'x', 'origin/main'])).not.toThrow();
    for (const bad of [
      ['push', 'origin', 'x'],
      ['rebase', 'main'],
      ['reset', '--hard'],
      ['add', '-A'],
      ['checkout', '-f', 'x'],
      ['checkout', '-B', 'x'],
      ['worktree', 'add', '--force', 'd'],
    ]) {
      expect(() => assertSafeGit(bad)).toThrow();
    }
  });
});

describe('config', () => {
  const raw = { repo: 'o/r', lanes: { a: { dir: '../a', model: 'fable' }, b: { dir: '../b' } } };
  it('gộp mặc định, đổi đường dẫn tương đối theo vị trí config', () => {
    const c = resolveConfig(raw, '/p/repo');
    expect(c.maxFixesPerPr).toBe(2);
    expect(c.branchPrefix).toBe('feat/');
    expect(c.ci.pollSeconds).toBe(DEFAULTS.ci.pollSeconds);
    expect(c.lanes.a.dir.replace(/\\/g, '/')).toMatch(/\/p\/a$/);
    expect(c.agent.disallowedTools).toContain('Bash(git push --force:*)');
  });
  it('mô hình: bước > làn > mặc định', () => {
    const c = resolveConfig(raw, '/p/repo');
    expect(modelFor(c, 'a', { model: 'haiku' })).toBe('haiku');
    expect(modelFor(c, 'a', {})).toBe('fable');
    expect(modelFor(c, 'b', {})).toBe('sonnet');
  });
  it('báo mọi lỗi cấu hình', () => {
    expect(validateConfig(null)).toHaveLength(1);
    const errs = validateConfig({
      repo: 'x',
      lanes: { 'a b': {} },
      maxFixesPerPr: -1,
      merge: { method: 'x' },
      log: { format: 'y' },
      branchPrefix: 1,
    });
    expect(errs.length).toBeGreaterThanOrEqual(6);
    expect(validateConfig({ repo: 'o/r', lanes: {} })).toEqual(['lanes: cần ít nhất một làn']);
    expect(() => resolveConfig({ repo: 'x' }, '/p')).toThrow(/sai/);
    expect(validateConfig(raw)).toEqual([]);
  });
});

describe('templates và log', () => {
  it('điền biến, thiếu biến thì lỗi; bullets', () => {
    expect(renderTemplate('a {{x}} b {{ y }}', { x: 1, y: 'z' })).toBe('a 1 b z');
    expect(() => renderTemplate('{{thieu}}', {})).toThrow(/thieu/);
    expect(bullets(['a', 'b'])).toBe('- a\n- b');
    expect(bullets([], 'trống')).toBe('trống');
  });
  it('định dạng log thường/JSON và dòng cảnh báo', () => {
    const e = { ts: 't', lane: 'a', msg: 'm', data: { k: 1 } };
    expect(formatLine('text', e)).toBe('t [a] m {"k":1}');
    expect(formatLine('text', { ts: 't', lane: 'a', msg: 'm' })).toBe('t [a] m');
    expect(JSON.parse(formatLine('json', e))).toEqual(e);
    expect(formatAlert({ ts: 't', type: 'KẸT', lane: 'a', msg: 'm' })).toBe('t\tKẸT\ta\tm');
  });
});

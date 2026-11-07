import { describe, expect, it } from 'vitest';
import { createDemoDrafter, createDemoExtractor } from './demo-ai';
import { createDemoKnowledge } from './demo-knowledge';
import { parseTestCases, runTestSet, TESTSET_MAX_CASES, type TestCase } from './test-set';
import { runTryPipeline } from './try-pipeline';

const deps = {
  extractor: createDemoExtractor(),
  drafter: createDemoDrafter(),
  knowledge: createDemoKnowledge(),
};
const run = (text: string) =>
  runTryPipeline(
    {
      workspaceId: 'w1',
      text,
      kbVersion: 'demo',
      voice: { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' },
      autoSendEnabled: true,
    },
    deps,
  );

const c = (over: Partial<TestCase> = {}): TestCase => ({
  question: 'áo thun basic size M màu đen giá bao nhiêu?',
  expectAction: 'answer',
  replyIncludes: [],
  ...over,
});

describe('FR-054 US-034 parseTestCases', () => {
  it('chấp nhận ca hợp lệ, cắt khoảng trắng, mặc định replyIncludes rỗng', () => {
    const r = parseTestCases([{ question: ' giá? ', expectAction: 'answer' }]);
    expect(r).toEqual({
      ok: true,
      cases: [{ question: 'giá?', expectAction: 'answer', replyIncludes: [] }],
    });
  });
  it('từ chối rỗng, quá nhiều ca, hành động lạ, câu hỏi rỗng', () => {
    expect(parseTestCases([])).toEqual({ ok: false, reason: 'empty' });
    const many = Array.from({ length: TESTSET_MAX_CASES + 1 }, () => c());
    expect(parseTestCases(many)).toEqual({ ok: false, reason: 'too_many' });
    expect(parseTestCases([{ question: 'x', expectAction: 'hide' }])).toEqual({
      ok: false,
      reason: 'invalid',
      index: 0,
    });
    expect(parseTestCases([c(), { question: '   ', expectAction: 'skip' }])).toEqual({
      ok: false,
      reason: 'invalid',
      index: 1,
    });
  });
  it('đúng ngưỡng TESTSET_MAX_CASES vẫn hợp lệ', () => {
    const edge = Array.from({ length: TESTSET_MAX_CASES }, () => c());
    expect(parseTestCases(edge).ok).toBe(true);
  });
  it('đầu vào không phải mảng → empty', () => {
    expect(parseTestCases('x')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('FR-054 runTestSet', () => {
  it('ca khớp hành động → pass, cổng pass', async () => {
    const out = await runTestSet([c()], run);
    expect(out.results[0]?.status).toBe('pass');
    expect(out.summary).toEqual({ total: 1, passed: 1, failed: 0, errored: 0, gate: 'pass' });
  });
  it('sai hành động → fail kèm hành động thực tế', async () => {
    const out = await runTestSet([c({ expectAction: 'handoff' })], run);
    const r = out.results[0];
    expect(r?.status).toBe('fail');
    expect(r?.failures).toContain('action_mismatch');
    expect(r?.actual).toBe('answer');
    expect(out.summary.gate).toBe('fail');
  });
  it('thiếu từ khóa trong câu trả lời → fail, liệt kê từ khóa thiếu', async () => {
    const out = await runTestSet([c({ replyIncludes: ['KHÔNG-CÓ-CHỮ-NÀY'] })], run);
    expect(out.results[0]?.failures).toEqual(['reply_missing']);
    expect(out.results[0]?.missing).toEqual(['KHÔNG-CÓ-CHỮ-NÀY']);
  });
  it('từ khóa có trong câu trả lời (khác hoa thường/dấu) → pass', async () => {
    const first = await run(c().question);
    if (first.status !== 'done') throw new Error('fixture phải chạy xong');
    const word = first.reply.split(/\s+/).find((w) => /\p{L}{3,}/u.test(w)) ?? '';
    const folded = word.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
    const out = await runTestSet([c({ replyIncludes: [folded] })], run);
    expect(out.results[0]?.status).toBe('pass');
  });
  it('bình luận chỉ emoji → actual "skip"; mong đợi skip thì pass', async () => {
    const pass = await runTestSet([c({ question: '😀😀', expectAction: 'skip' })], run);
    expect(pass.results[0]?.status).toBe('pass');
    const fail = await runTestSet([c({ question: '😀😀', expectAction: 'answer' })], run);
    expect(fail.results[0]?.actual).toBe('skip');
    expect(fail.results[0]?.status).toBe('fail');
  });
  it('guard số tiền hỏng → fail guard_failed dù đúng hành động', async () => {
    const out = await runTestSet([c()], async (t) => {
      const r = await run(t);
      if (r.status !== 'done') throw new Error('x');
      return { ...r, guard: { ok: false, violations: [], replyViolations: [] } };
    });
    expect(out.results[0]?.failures).toContain('guard_failed');
  });
  it('lỗi một ca không làm hỏng ca khác; chỉ ghi tên lỗi, cổng fail', async () => {
    let n = 0;
    const out = await runTestSet([c(), c()], async (t) => {
      n += 1;
      if (n === 1) throw new TypeError('chi tiết nội bộ nhạy cảm');
      return run(t);
    });
    expect(out.results[0]).toMatchObject({ status: 'error', error: 'TypeError' });
    expect(JSON.stringify(out)).not.toContain('nhạy cảm');
    expect(out.results[1]?.status).toBe('pass');
    expect(out.summary).toEqual({ total: 2, passed: 1, failed: 0, errored: 1, gate: 'fail' });
  });
  it('lỗi không phải Error → tên "unknown"', async () => {
    const out = await runTestSet([c()], async () => {
      throw 'boom';
    });
    expect(out.results[0]).toMatchObject({ status: 'error', error: 'unknown' });
  });
  it('bộ rỗng → cổng fail (không có bằng chứng thì không cho qua)', async () => {
    const out = await runTestSet([], run);
    expect(out.summary).toEqual({ total: 0, passed: 0, failed: 0, errored: 0, gate: 'fail' });
  });
  it('chạy tuần tự theo thứ tự đầu vào', async () => {
    const seen: string[] = [];
    await runTestSet([c({ question: 'a1' }), c({ question: 'b2' })], async (t) => {
      seen.push(t);
      return run(t);
    });
    expect(seen).toEqual(['a1', 'b2']);
  });
});

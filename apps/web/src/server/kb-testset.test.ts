import { createTryQuota } from '@flow/ai';
import { describe, expect, it } from 'vitest';
import { createKbTestSetAction } from './kb-testset';
import { NoKnowledgeError } from './try-ai-knowledge';

const session = { workspaceId: 'ws1' };
const now = () => new Date('2026-11-06T10:00:00Z');

function action(limit = 3) {
  return createKbTestSetAction({ quota: createTryQuota({ limit }), now, ...demoWiring });
}

import { demoBuildDeps, demoKnowledgeRunner, demoWiring } from './test-demo-wiring';

describe('FR-054 US-034 bộ câu kiểm thử: đầu vào, hạn mức, kết quả', () => {
  it('chạy cả bộ bằng mock, không trừ lượt gói, báo cổng đạt', async () => {
    const r = await action()(session, 'ship về Hà Nội bao nhiêu | answer | 20.000đ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary).toEqual({ total: 1, passed: 1, failed: 0, errored: 0, gate: 'pass' });
    expect(r.results[0]?.status).toBe('pass');
    expect(r.knowledge).toBe('shop');
    expect(r.quota).toEqual({ used: 1, limit: 3 });
  });

  it('có ca không đạt → cổng fail, vẫn trả chi tiết từng ca', async () => {
    const r = await action()(session, 'ship về Hà Nội | handoff\n😀 | skip');
    if (!r.ok) throw new Error('expected ok');
    expect(r.summary).toMatchObject({ total: 2, passed: 1, failed: 1, gate: 'fail' });
    expect(r.results[0]?.failures).toContain('action_mismatch');
  });

  it('đầu vào sai → từ chối kèm lý do, KHÔNG tốn hạn mức', async () => {
    const run = action(1);
    expect(await run(session, '  ')).toEqual({ ok: false, reason: 'empty' });
    expect(await run(session, 'thiếu hành động')).toEqual({
      ok: false,
      reason: 'invalid_line',
      line: 1,
    });
    expect((await run(session, 'ship | answer')).ok).toBe(true);
  });

  it('quá hạn mức/ngày → limit_reached, không chạy pipeline', async () => {
    const run = action(1);
    await run(session, 'ship | answer');
    expect(await run(session, 'ship | answer')).toEqual({ ok: false, reason: 'limit_reached' });
  });

  it('lỗi pipeline từng ca nằm trong kết quả (error), không làm hỏng cả lần chạy', async () => {
    const r = await createKbTestSetAction({
      quota: createTryQuota({ limit: 2 }),
      now,
      knowledgeRunner: demoKnowledgeRunner,
      buildDeps: () => ({
        extractor: {
          extract: async () => {
            throw new RangeError('x');
          },
        },
        drafter: { draft: async () => Promise.reject(new Error('x')) },
        knowledge: {
          matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
          lookupProductFacts: async () => [],
          searchKb: async () => [],
        },
      }),
    })(session, 'giá | answer');
    if (!r.ok) throw new Error('expected ok');
    expect(r.results[0]).toMatchObject({ status: 'error', error: 'RangeError' });
    expect(r.summary.gate).toBe('fail');
  });

  it('knowledgeRunner thất bại → unavailable và chỉ log tên lỗi', async () => {
    const warned: unknown[] = [];
    const r = await createKbTestSetAction({
      quota: createTryQuota({ limit: 2 }),
      now,
      buildDeps: demoBuildDeps,
      knowledgeRunner: async () => {
        throw new TypeError('chi tiết nhạy cảm');
      },
      warn: (e) => warned.push(e),
    })(session, 'ship | answer');
    expect(r).toEqual({ ok: false, reason: 'unavailable' });
    expect(JSON.stringify(warned)).not.toContain('nhạy cảm');
    expect(warned).toEqual([{ event: 'kb_testset_failed', reason: 'TypeError' }]);
  });
});

describe('bộ câu kiểm thử không chạy bản mẫu', () => {
  it('thiếu LLM thật → llm_missing_service, không tốn hạn mức', async () => {
    const quota = createTryQuota({ limit: 1 });
    const run = createKbTestSetAction({ quota, now, knowledgeRunner: demoKnowledgeRunner });
    for (let i = 0; i < 2; i++) {
      expect(await run(session, 'ship | answer')).toEqual({
        ok: false,
        reason: 'llm_missing_service',
      });
    }
  });

  it('chưa có nguồn kiến thức thật → no_knowledge', async () => {
    const run = createKbTestSetAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      buildDeps: demoBuildDeps,
    });
    expect(await run(session, 'ship | answer')).toEqual({ ok: false, reason: 'no_knowledge' });
    const thrown = createKbTestSetAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      buildDeps: demoBuildDeps,
      knowledgeRunner: async () => {
        throw new NoKnowledgeError();
      },
    });
    expect(await thrown(session, 'ship | answer')).toEqual({ ok: false, reason: 'no_knowledge' });
  });
});

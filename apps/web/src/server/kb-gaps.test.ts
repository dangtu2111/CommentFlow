import { describe, expect, it, vi } from 'vitest';
import { createKbGapService } from './kb-gaps';

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const GAP = '33333333-3333-4333-8333-333333333333';

function setup(setStatusResult = true) {
  const tx = { tag: 'tx' };
  const calls: string[] = [];
  const ops = {
    listKbGaps: vi.fn(async () => []),
    setKbGapStatus: vi.fn(async () => {
      calls.push('status');
      return setStatusResult;
    }),
    createFaqItem: vi.fn(async () => {
      calls.push('faq');
      return 'faq-1';
    }),
  };
  const withActor = vi.fn(async (_ws: string, _u: string, fn: (t: typeof tx) => unknown) => fn(tx));
  const service = createKbGapService({ db: { withActor } as never, ops: ops as never });
  return { service, ops, withActor, tx, calls };
}

describe('FR-134 UF-11 bổ sung kiến thức từ câu hỏi chưa trả lời', () => {
  it('FR-134 bổ sung: một giao dịch withActor, đổi gap → resolved rồi tạo FAQ', async () => {
    const { service, ops, withActor, calls, tx } = setup();
    const faq = { question: 'Ship?', answer: '20k', lang: 'vi' as const, tags: [] };
    const r = await service.apply(
      { workspaceId: WS, userId: USER },
      { intent: 'resolve', gapId: GAP, faq },
    );
    expect(r).toBe('ok');
    expect(withActor).toHaveBeenCalledTimes(1);
    expect(withActor.mock.calls[0]?.slice(0, 2)).toEqual([WS, USER]);
    expect(calls).toEqual(['status', 'faq']);
    expect(ops.setKbGapStatus).toHaveBeenCalledWith(tx, GAP, 'resolved');
    expect(ops.createFaqItem).toHaveBeenCalledWith(tx, WS, faq);
  });

  it('FR-134 gap không thấy được (workspace khác) → not_found, KHÔNG tạo FAQ', async () => {
    const { service, ops } = setup(false);
    const r = await service.apply(
      { workspaceId: WS, userId: USER },
      {
        intent: 'resolve',
        gapId: GAP,
        faq: { question: 'q', answer: 'a', lang: 'all', tags: [] },
      },
    );
    expect(r).toBe('not_found');
    expect(ops.createFaqItem).not.toHaveBeenCalled();
  });

  it('FR-134 bỏ qua → ignored; mở lại → open; id lạ → not_found', async () => {
    const a = setup();
    expect(
      await a.service.apply({ workspaceId: WS, userId: USER }, { intent: 'ignore', gapId: GAP }),
    ).toBe('ok');
    expect(a.ops.setKbGapStatus).toHaveBeenCalledWith(a.tx, GAP, 'ignored');
    const b = setup();
    expect(
      await b.service.apply({ workspaceId: WS, userId: USER }, { intent: 'reopen', gapId: GAP }),
    ).toBe('ok');
    expect(b.ops.setKbGapStatus).toHaveBeenCalledWith(b.tx, GAP, 'open');
    const c = setup(false);
    expect(
      await c.service.apply({ workspaceId: WS, userId: USER }, { intent: 'ignore', gapId: GAP }),
    ).toBe('not_found');
    expect(c.ops.createFaqItem).not.toHaveBeenCalled();
  });

  it('FR-134 danh sách đọc qua withActor với bộ lọc', async () => {
    const { service, ops, withActor, tx } = setup();
    await service.list({ workspaceId: WS, userId: USER }, { status: 'open', topic: 'size' });
    expect(withActor).toHaveBeenCalledTimes(1);
    expect(ops.listKbGaps).toHaveBeenCalledWith(tx, { status: 'open', topic: 'size' });
  });
});

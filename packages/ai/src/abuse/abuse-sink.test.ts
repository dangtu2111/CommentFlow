import { describe, expect, it } from 'vitest';
import { createInMemoryAbuseSink } from './abuse-sink';

describe('FR-115 createInMemoryAbuseSink', () => {
  it('suspendChannels chỉ trả kênh MỚI bị khóa (lặp lại cùng hạn → rỗng; workspace khác tách riêng)', async () => {
    const sink = createInMemoryAbuseSink();
    const until = new Date('2026-11-07T00:00:00Z');
    const s = [{ channelId: 'c1', reason: 'graph_368' as const, until }];
    expect(await sink.suspendChannels('ws1', s)).toEqual(['c1']);
    expect(await sink.suspendChannels('ws1', s)).toEqual([]);
    expect(await sink.suspendChannels('ws2', s)).toEqual(['c1']);
  });
  it('ghi lại thông báo/tín hiệu/hàng xem xét theo workspace', async () => {
    const sink = createInMemoryAbuseSink();
    await sink.notify('ws1', { kind: 'workspace_paused', reason: 'marked_wrong_rate' });
    await sink.recordSignals('ws1', [{ signal: 'volume_spike', channelId: null }]);
    await sink.enqueueReview('ws1', { blockAutoSend: true, items: [{ id: 'a', keyword: 'x' }] });
    expect(sink.notifications).toHaveLength(1);
    expect(sink.signals).toHaveLength(1);
    expect(sink.reviews).toHaveLength(1);
  });
});

import { describe, expect, it, vi } from 'vitest';

const listApproved = vi.fn();
vi.mock('@flow/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@flow/db')>()),
  listApprovedPolicyFacts: (...args: unknown[]) => listApproved(...args),
}));

const { loadFactSlots } = await import('./pipeline-job');

const db = { withJob: async (_ws: string, fn: (tx: unknown) => unknown) => fn({}) } as never;
const rows = [
  { id: 'a1', kind: 'returns', data: { days: 7 }, status: 'approved' },
  { id: 'd1', kind: 'cod', data: { value: true }, status: 'draft' },
];

describe('loadFactSlots — thẻ luôn nạp, cờ cf.ai.fact_slots chỉ bật chế độ chỗ giữ chỗ', () => {
  it('không truyền cờ hoặc cờ TẮT → mode=false nhưng VẪN nạp thẻ đã duyệt cho fact plan', async () => {
    listApproved.mockReset();
    listApproved.mockResolvedValue(rows);
    for (const config of [{ db }, { db, factSlotsEnabled: async () => false }]) {
      const result = await loadFactSlots(config, 'ws');
      expect(result.mode).toBe(false);
      expect(result.factSlots.policy.returns).toMatchObject({ days: 7, sourceId: 'pf:a1' });
    }
    expect(listApproved).toHaveBeenCalledTimes(2);
  });

  it('cờ BẬT → mode=true; chỉ chính sách ĐÃ DUYỆT vào fact plan; bản nháp (kể cả bị đưa nhầm vào danh sách) không bao giờ vào', async () => {
    listApproved.mockResolvedValue(rows);
    const result = await loadFactSlots({ db, factSlotsEnabled: async () => true }, 'ws');
    expect(listApproved).toHaveBeenCalledWith(expect.anything(), 'ws');
    expect(result.mode).toBe(true);
    expect(result.factSlots.policy.returns).toMatchObject({ days: 7, sourceId: 'pf:a1' });
    expect(result.factSlots.policy.cod).toBeUndefined();
    expect(result.factSlots.stock).toEqual({ disclose: 'status', lowAt: null });
  });
});

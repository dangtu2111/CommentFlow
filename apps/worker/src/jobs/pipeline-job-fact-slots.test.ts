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

describe('loadFactSlots — cờ cf.ai.fact_slots', () => {
  it('không truyền cờ hoặc cờ TẮT → undefined và KHÔNG đọc policy_facts (đường cũ không đổi)', async () => {
    listApproved.mockClear();
    expect(await loadFactSlots({ db }, 'ws')).toBeUndefined();
    expect(await loadFactSlots({ db, factSlotsEnabled: async () => false }, 'ws')).toBeUndefined();
    expect(listApproved).not.toHaveBeenCalled();
  });

  it('cờ BẬT → chỉ chính sách ĐÃ DUYỆT vào fact plan; bản nháp (kể cả bị đưa nhầm vào danh sách) không bao giờ vào', async () => {
    listApproved.mockResolvedValue(rows);
    const slots = await loadFactSlots({ db, factSlotsEnabled: async () => true }, 'ws');
    expect(listApproved).toHaveBeenCalledWith(expect.anything(), 'ws');
    expect(slots?.policy.returns).toMatchObject({ days: 7, sourceId: 'pf:a1' });
    expect(slots?.policy.cod).toBeUndefined();
    expect(slots?.stock).toEqual({ disclose: 'status', lowAt: null });
  });
});

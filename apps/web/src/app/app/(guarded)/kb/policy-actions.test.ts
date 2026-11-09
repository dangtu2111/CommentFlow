import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  discard: vi.fn(),
  edit: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  allowed: vi.fn(),
  withActor: vi.fn(),
  requireAppUser: vi.fn(),
}));

vi.mock('@flow/db/runtime', () => ({
  approvePolicyFact: mocks.approve,
  discardPolicyDraft: mocks.discard,
  editPolicyDraft: mocks.edit,
  listAllPolicyFacts: mocks.list,
  savePolicyFact: mocks.save,
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock('../../../../server/action-guard', () => ({ actionAllowed: mocks.allowed }));
vi.mock('../../../../server/db', () => ({ getDb: () => ({ withActor: mocks.withActor }) }));
vi.mock('../../../../server/require-app-user', () => ({ requireAppUser: mocks.requireAppUser }));

import {
  approvePolicyAction,
  discardPolicyDraftAction,
  savePolicyValueAction,
} from './policy-actions';

const ID = '11111111-1111-4111-8111-111111111111';
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const redirectOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message.replace('REDIRECT:', '');
  }
  return null;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAppUser.mockResolvedValue({ user: { id: 'u1' }, workspace: { id: 'w1' } });
  mocks.allowed.mockResolvedValue(true);
  mocks.withActor.mockImplementation(
    async (_w: string, _u: string, run: (tx: unknown) => unknown) => run({}),
  );
});

describe('approvePolicyAction', () => {
  it.each([
    ['approved', 'approved'],
    ['stale', 'stale'],
    ['not_found', 'not_found'],
    ['needs_review', 'needs_review'],
  ])(
    'kết quả %s → ?pn=%s; truyền workspace từ phiên, id/rev/confirm từ form',
    async (result, pn) => {
      mocks.approve.mockResolvedValue(result);
      const to = await redirectOf(approvePolicyAction(form({ id: ID, rev: '2', confirm: 'on' })));
      expect(to).toBe(`/app/kb/policies?pn=${pn}`);
      expect(mocks.requireAppUser).toHaveBeenCalledWith({ role: 'owner' });
      expect(mocks.approve).toHaveBeenCalledWith({}, 'w1', ID, 2, { confirmReview: true });
    },
  );

  it('form sai → invalid, không chạm DB', async () => {
    expect(await redirectOf(approvePolicyAction(form({ id: 'x', rev: '1' })))).toBe(
      '/app/kb/policies?pn=invalid',
    );
    expect(mocks.withActor).not.toHaveBeenCalled();
  });

  it('bị giới hạn tốc độ → rate_limited, không ghi', async () => {
    mocks.allowed.mockResolvedValue(false);
    expect(await redirectOf(approvePolicyAction(form({ id: ID, rev: '1' })))).toBe(
      '/app/kb/policies?pn=rate_limited',
    );
    expect(mocks.withActor).not.toHaveBeenCalled();
  });

  it('lỗi bất ngờ → unavailable (không lộ chi tiết)', async () => {
    mocks.approve.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await redirectOf(approvePolicyAction(form({ id: ID, rev: '1' })))).toBe(
      '/app/kb/policies?pn=unavailable',
    );
    expect(JSON.stringify(spy.mock.calls)).not.toContain('boom');
    spy.mockRestore();
  });
});

describe('discardPolicyDraftAction', () => {
  it.each([
    ['discarded', 'discarded'],
    ['stale', 'stale'],
    ['not_found', 'not_found'],
  ])('kết quả %s → ?pn=%s', async (result, pn) => {
    mocks.discard.mockResolvedValue(result);
    expect(await redirectOf(discardPolicyDraftAction(form({ id: ID, rev: '4' })))).toBe(
      `/app/kb/policies?pn=${pn}`,
    );
    expect(mocks.discard).toHaveBeenCalledWith({}, 'w1', ID, 4);
  });
});

describe('savePolicyValueAction', () => {
  const valid = { kind: 'returns', days: '7', conditions: 'Còn tem mác' };
  const draftRow = { id: ID, kind: 'returns', slot: 'returns', status: 'draft', rev: 3 };

  it('giá trị mới (chưa có nháp) → ghi NHÁP origin manual, không evidence, ghi theo phiên → ?pn=saved', async () => {
    mocks.list.mockResolvedValue([]);
    mocks.save.mockResolvedValue('x');
    expect(await redirectOf(savePolicyValueAction(form(valid)))).toBe('/app/kb/policies?pn=saved');
    expect(mocks.save).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        workspaceId: 'w1',
        kind: 'returns',
        slot: 'returns',
        status: 'draft',
        origin: 'manual',
        evidence: null,
        createdBy: 'u1',
      }),
    );
    expect(mocks.requireAppUser).toHaveBeenCalledWith({ role: 'owner' });
  });

  it('đang có nháp khớp draftId + rev → thay tại chỗ bằng editPolicyDraft', async () => {
    mocks.list.mockResolvedValue([draftRow]);
    mocks.edit.mockResolvedValue('edited');
    expect(await redirectOf(savePolicyValueAction(form({ ...valid, draftId: ID, rev: '3' })))).toBe(
      '/app/kb/policies?pn=saved',
    );
    expect(mocks.edit).toHaveBeenCalledWith({}, 'w1', ID, 3, expect.any(Object), 'u1');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each([
    ['nháp mới xuất hiện khi Owner mở biểu mẫu không kèm nháp', [draftRow], {}],
    ['rev lệch', [draftRow], { draftId: ID, rev: '2' }],
    [
      'id nháp lệch',
      [{ ...draftRow, id: '22222222-2222-4222-8222-222222222222' }],
      { draftId: ID, rev: '3' },
    ],
    ['nháp đã biến mất (đã duyệt/bỏ)', [], { draftId: ID, rev: '3' }],
  ])('%s → stale, không ghi', async (_name, rows, extra) => {
    mocks.list.mockResolvedValue(rows);
    expect(await redirectOf(savePolicyValueAction(form({ ...valid, ...extra })))).toBe(
      '/app/kb/policies?pn=stale',
    );
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it('editPolicyDraft trả stale / not_found → thông báo tương ứng', async () => {
    mocks.list.mockResolvedValue([draftRow]);
    mocks.edit.mockResolvedValueOnce('stale').mockResolvedValueOnce('not_found');
    const f = form({ ...valid, draftId: ID, rev: '3' });
    expect(await redirectOf(savePolicyValueAction(f))).toBe('/app/kb/policies?pn=stale');
    expect(await redirectOf(savePolicyValueAction(f))).toBe('/app/kb/policies?pn=not_found');
  });

  it('form sai → invalid; giới hạn tốc độ → rate_limited; lỗi bất ngờ → unavailable', async () => {
    expect(await redirectOf(savePolicyValueAction(form({ kind: 'returns' })))).toBe(
      '/app/kb/policies?pn=invalid',
    );
    expect(mocks.withActor).not.toHaveBeenCalled();
    mocks.allowed.mockResolvedValueOnce(false);
    expect(await redirectOf(savePolicyValueAction(form(valid)))).toBe(
      '/app/kb/policies?pn=rate_limited',
    );
    mocks.list.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await redirectOf(savePolicyValueAction(form(valid)))).toBe(
      '/app/kb/policies?pn=unavailable',
    );
    spy.mockRestore();
  });
});

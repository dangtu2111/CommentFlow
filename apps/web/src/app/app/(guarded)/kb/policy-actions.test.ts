import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  discard: vi.fn(),
  allowed: vi.fn(),
  withActor: vi.fn(),
  requireAppUser: vi.fn(),
}));

vi.mock('@flow/db/runtime', () => ({
  approvePolicyFact: mocks.approve,
  discardPolicyDraft: mocks.discard,
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock('../../../../server/action-guard', () => ({ actionAllowed: mocks.allowed }));
vi.mock('../../../../server/db', () => ({ getDb: () => ({ withActor: mocks.withActor }) }));
vi.mock('../../../../server/require-app-user', () => ({ requireAppUser: mocks.requireAppUser }));

import { approvePolicyAction, discardPolicyDraftAction } from './policy-actions';

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

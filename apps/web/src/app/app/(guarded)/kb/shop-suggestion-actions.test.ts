import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decide: vi.fn(),
  allowed: vi.fn(),
  withActor: vi.fn(),
  requireAppUser: vi.fn(),
  requestKbSync: vi.fn(),
}));

vi.mock('@flow/db/runtime', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  decideShopSuggestion: mocks.decide,
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock('../../../../server/action-guard', () => ({ actionAllowed: mocks.allowed }));
vi.mock('../../../../server/db', () => ({ getDb: () => ({ withActor: mocks.withActor }) }));
vi.mock('../../../../server/require-app-user', () => ({ requireAppUser: mocks.requireAppUser }));
vi.mock('../../../../server/kb-sync-request', () => ({ requestKbSync: mocks.requestKbSync }));

import { decideShopSuggestionAction } from './shop-suggestion-actions';

const ID = '11111111-1111-4111-8111-111111111111';
const BACK = '/app/kb/shop';
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

describe('decideShopSuggestionAction', () => {
  it('Staff bị chặn: không ghi gì', async () => {
    mocks.requireAppUser.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(decideShopSuggestionAction(form({ id: ID, decision: 'applied' }))).rejects.toThrow(
      'NOT_FOUND',
    );
    expect(mocks.requireAppUser).toHaveBeenCalledWith({ role: 'owner' });
    expect(mocks.withActor).not.toHaveBeenCalled();
  });

  it('Áp dụng: gọi truy vấn với workspace từ phiên, báo applied và xếp đồng bộ kiến thức', async () => {
    mocks.decide.mockResolvedValue('applied');
    expect(
      await redirectOf(decideShopSuggestionAction(form({ id: ID, decision: 'applied' }))),
    ).toBe(`${BACK}?n=applied`);
    expect(mocks.decide).toHaveBeenCalledWith({}, 'w1', ID, 'applied');
    expect(mocks.requestKbSync).toHaveBeenCalledWith('w1');
  });

  it('Bỏ: báo rejected, không đồng bộ kiến thức', async () => {
    mocks.decide.mockResolvedValue('rejected');
    expect(
      await redirectOf(decideShopSuggestionAction(form({ id: ID, decision: 'rejected' }))),
    ).toBe(`${BACK}?n=rejected`);
    expect(mocks.requestKbSync).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 'not_found'],
    ['no_profile', 'no_profile'],
    ['too_long', 'too_long'],
  ])('kết quả %s → thông báo %s, không đồng bộ', async (outcome, notice) => {
    mocks.decide.mockResolvedValue(outcome);
    expect(
      await redirectOf(decideShopSuggestionAction(form({ id: ID, decision: 'applied' }))),
    ).toBe(`${BACK}?n=${notice}`);
    expect(mocks.requestKbSync).not.toHaveBeenCalled();
  });

  it('id không phải uuid → not_found; quyết định lạ → invalid; không chạm DB', async () => {
    expect(
      await redirectOf(decideShopSuggestionAction(form({ id: 'x', decision: 'applied' }))),
    ).toBe(`${BACK}?n=not_found`);
    expect(await redirectOf(decideShopSuggestionAction(form({ id: ID, decision: 'delete' })))).toBe(
      `${BACK}?n=invalid`,
    );
    expect(mocks.withActor).not.toHaveBeenCalled();
  });

  it('bị giới hạn tốc độ → rate_limited, không ghi; lỗi DB → unavailable', async () => {
    mocks.allowed.mockResolvedValue(false);
    expect(
      await redirectOf(decideShopSuggestionAction(form({ id: ID, decision: 'applied' }))),
    ).toBe(`${BACK}?n=rate_limited`);
    expect(mocks.withActor).not.toHaveBeenCalled();
    mocks.allowed.mockResolvedValue(true);
    mocks.decide.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await redirectOf(decideShopSuggestionAction(form({ id: ID, decision: 'applied' }))),
    ).toBe(`${BACK}?n=unavailable`);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  allowed: vi.fn(),
  withActor: vi.fn(),
  requireAppUser: vi.fn(),
}));

vi.mock('@flow/db/runtime', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAbbreviation: mocks.create,
  updateAbbreviation: mocks.update,
  deleteAbbreviation: mocks.remove,
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
  createAbbreviationAction,
  deleteAbbreviationAction,
  updateAbbreviationAction,
} from './abbreviation-actions';

const ID = '11111111-1111-4111-8111-111111111111';
const BACK = '/app/kb/abbreviations';
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

describe('quyền (chỉ Owner)', () => {
  it.each([
    ['thêm', () => createAbbreviationAction(form({ short: 'sz', full: 'size', lang: 'vi' }))],
    [
      'sửa',
      () => updateAbbreviationAction(form({ id: ID, short: 'sz', full: 'size', lang: 'vi' })),
    ],
    ['xóa', () => deleteAbbreviationAction(form({ id: ID }))],
  ])('Staff bị chặn khi %s: không ghi gì', async (_name, run) => {
    mocks.requireAppUser.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(run()).rejects.toThrow('NOT_FOUND');
    expect(mocks.withActor).not.toHaveBeenCalled();
  });

  it('requireAppUser luôn được gọi với vai trò owner', async () => {
    mocks.create.mockResolvedValue('id');
    await redirectOf(createAbbreviationAction(form({ short: 'sz', full: 'size', lang: 'vi' })));
    expect(mocks.requireAppUser).toHaveBeenCalledWith({ role: 'owner' });
  });
});

describe('createAbbreviationAction', () => {
  it('Owner thêm được; workspace/người dùng lấy từ phiên, không từ form', async () => {
    mocks.create.mockResolvedValue('id');
    const to = await redirectOf(
      createAbbreviationAction(
        form({ short: ' SZ ', full: 'size', lang: 'vi', workspaceId: 'w-khac' }),
      ),
    );
    expect(to).toBe(`${BACK}?n=saved`);
    expect(mocks.withActor).toHaveBeenCalledWith('w1', 'u1', expect.any(Function));
    expect(mocks.create).toHaveBeenCalledWith({}, 'w1', { short: 'sz', full: 'size', lang: 'vi' });
  });

  it('dữ liệu sai (có khoảng trắng, ngôn ngữ lạ) → invalid, không ghi', async () => {
    for (const bad of [
      { short: 'a b', full: 'x', lang: 'vi' },
      { short: 'sz', full: 'size', lang: 'fr' },
      { short: '', full: 'size', lang: 'vi' },
    ]) {
      expect(await redirectOf(createAbbreviationAction(form(bad)))).toBe(`${BACK}?n=invalid`);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('trùng từ (23505) → invalid; lỗi khác → unavailable', async () => {
    mocks.create.mockRejectedValueOnce({ code: '23505' });
    const data = () => form({ short: 'sz', full: 'size', lang: 'vi' });
    expect(await redirectOf(createAbbreviationAction(data()))).toBe(`${BACK}?n=invalid`);
    mocks.create.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await redirectOf(createAbbreviationAction(data()))).toBe(`${BACK}?n=unavailable`);
  });

  it('bị giới hạn tốc độ → rate_limited, không ghi', async () => {
    mocks.allowed.mockResolvedValue(false);
    const to = await redirectOf(
      createAbbreviationAction(form({ short: 'sz', full: 'size', lang: 'vi' })),
    );
    expect(to).toBe(`${BACK}?n=rate_limited`);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('updateAbbreviationAction / deleteAbbreviationAction', () => {
  it('id lạ → not_found, không ghi', async () => {
    expect(
      await redirectOf(
        updateAbbreviationAction(form({ id: 'x', short: 'sz', full: 'size', lang: 'vi' })),
      ),
    ).toBe(`${BACK}?n=not_found`);
    expect(await redirectOf(deleteAbbreviationAction(form({ id: 'x' })))).toBe(
      `${BACK}?n=not_found`,
    );
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('mục của workspace khác (RLS giấu → false) → not_found', async () => {
    mocks.update.mockResolvedValue(false);
    mocks.remove.mockResolvedValue(false);
    expect(
      await redirectOf(
        updateAbbreviationAction(form({ id: ID, short: 'sz', full: 'size', lang: 'vi' })),
      ),
    ).toBe(`${BACK}?n=not_found`);
    expect(await redirectOf(deleteAbbreviationAction(form({ id: ID })))).toBe(
      `${BACK}?n=not_found`,
    );
    expect(mocks.update).toHaveBeenCalledWith({}, 'w1', ID, { short: 'sz', full: 'size' });
  });

  it('Owner sửa và xóa được mục của mình', async () => {
    mocks.update.mockResolvedValue(true);
    mocks.remove.mockResolvedValue(true);
    expect(
      await redirectOf(
        updateAbbreviationAction(form({ id: ID, short: 'sz', full: 'size', lang: 'vi' })),
      ),
    ).toBe(`${BACK}?n=saved`);
    expect(await redirectOf(deleteAbbreviationAction(form({ id: ID })))).toBe(`${BACK}?n=deleted`);
  });
});

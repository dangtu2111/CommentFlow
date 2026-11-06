import type { FlowDb } from '@flow/db';
import { describe, expect, it, vi } from 'vitest';
import { createTenancy } from './tenancy';

const USER = '11111111-1111-4111-8111-111111111111';

function fakeDb() {
  const set = vi.fn((_values: Record<string, unknown>) => ({ where: vi.fn(async () => undefined) }));
  const update = vi.fn(() => ({ set }));
  const withUser = vi.fn(async (_uid: string, fn: (tx: unknown) => unknown) => fn({ update }));
  return { db: { withUser } as unknown as FlowDb, withUser, set };
}

describe('setUserProfile (đơn vị)', () => {
  it('ghi tên + múi giờ + giao diện qua withUser của chính người đó, cắt khoảng trắng', async () => {
    const { db, withUser, set } = fakeDb();
    await createTenancy(db).setUserProfile(USER, {
      name: '  Nguyễn Văn A ',
      timezone: 'Asia/Bangkok',
      theme: 'dark',
    });
    expect(withUser).toHaveBeenCalledWith(USER, expect.any(Function));
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Nguyễn Văn A', timezone: 'Asia/Bangkok', theme: 'dark' }),
    );
  });

  it('chỉ ghi trường được gửi', async () => {
    const { db, set } = fakeDb();
    await createTenancy(db).setUserProfile(USER, { theme: 'light' });
    const values = set.mock.calls[0]?.[0] ?? {};
    expect(values).toHaveProperty('theme', 'light');
    expect(values).not.toHaveProperty('name');
    expect(values).not.toHaveProperty('timezone');
  });

  it.each([
    [{ name: '   ' }],
    [{ name: 'a'.repeat(81) }],
    [{ timezone: 'Mars/Olympus' }],
    [{ theme: 'neon' }],
    [{}],
  ])('từ chối %j và không chạm DB', async (input) => {
    const { db, withUser } = fakeDb();
    await expect(createTenancy(db).setUserProfile(USER, input as never)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(withUser).not.toHaveBeenCalled();
  });

  it('không nhận userId không phải uuid', async () => {
    const { db, withUser } = fakeDb();
    await expect(createTenancy(db).setUserProfile('x', { theme: 'dark' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(withUser).not.toHaveBeenCalled();
  });
});

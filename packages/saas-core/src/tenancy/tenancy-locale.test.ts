import type { FlowDb } from '@flow/db';
import { describe, expect, it, vi } from 'vitest';
import { createTenancy } from './tenancy';

const USER = '11111111-1111-4111-8111-111111111111';

function fakeDb() {
  const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
  const update = vi.fn(() => ({ set }));
  const withUser = vi.fn(async (_uid: string, fn: (tx: unknown) => unknown) => fn({ update }));
  return { db: { withUser } as unknown as FlowDb, withUser, set };
}

describe('FR-119 setUserLocale (đơn vị)', () => {
  it('ghi locale hợp lệ qua withUser của chính người đó', async () => {
    const { db, withUser, set } = fakeDb();
    await createTenancy(db).setUserLocale(USER, 'en');
    expect(withUser).toHaveBeenCalledWith(USER, expect.any(Function));
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }));
  });

  it('từ chối locale ngoài vi/en và userId không phải uuid, không chạm DB', async () => {
    const { db, withUser } = fakeDb();
    const tenancy = createTenancy(db);
    await expect(tenancy.setUserLocale(USER, 'fr' as never)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(tenancy.setUserLocale('x', 'vi')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(withUser).not.toHaveBeenCalled();
  });
});

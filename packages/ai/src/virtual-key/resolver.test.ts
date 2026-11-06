import { AppError } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createMemoryCostLedger } from '../cost-gate';
import { createMockKeyAdmin, type VirtualKeyAdmin } from './admin';
import { createVirtualKeyResolver } from './resolver';
import { createMemoryKeyStore, type VirtualKeyStore } from './store';

const WS_A = '0b6f2a3e-5d41-4c8e-9a10-7f3d2e1c4b5a';
const WS_B = '7c1d9e22-3b54-4f6a-8d70-1a2b3c4d5e6f';
const SHARED = 'shared-test';

function setup(overrides: Partial<Parameters<typeof createVirtualKeyResolver>[0]> = {}) {
  const admin = createMockKeyAdmin();
  const store = createMemoryKeyStore();
  const ledger = createMemoryCostLedger();
  ledger.setCap(WS_A, 10);
  ledger.setCap(WS_B, 20);
  const resolver = createVirtualKeyResolver({
    enabled: true,
    sharedKey: SHARED,
    defaultBudgetUsd: 5,
    admin,
    store,
    ledger,
    ...overrides,
  });
  return { admin, store, ledger, resolver };
}

describe('FR-034 cờ tắt → khóa dùng chung', () => {
  it('không gọi admin/store/ledger', async () => {
    const boom = new Proxy({}, { get: () => () => Promise.reject(new Error('không được gọi')) });
    const resolver = createVirtualKeyResolver({
      enabled: false,
      sharedKey: SHARED,
      defaultBudgetUsd: 5,
      admin: boom as VirtualKeyAdmin,
      store: boom as VirtualKeyStore,
      ledger: boom as never,
    });
    await expect(resolver.resolveKey(WS_A)).resolves.toBe(SHARED);
  });
});

describe('FR-034 cờ bật → khóa riêng theo workspace', () => {
  it('tạo khóa với ngân sách = trần, tái dùng lần sau', async () => {
    const { admin, resolver } = setup();
    const k1 = await resolver.resolveKey(WS_A);
    const k2 = await resolver.resolveKey(WS_A.toUpperCase());
    expect(k1).toBe(k2);
    expect(k1).not.toBe(SHARED);
    expect(admin.generateCount).toBe(1);
    expect(admin.budgetOf(k1)).toBe(10);
    expect(admin.aliasOf(k1)).toBe(`cf-ws-${WS_A}`);
  });

  it('hai workspace → hai khóa khác nhau, ngân sách riêng', async () => {
    const { admin, resolver } = setup();
    const a = await resolver.resolveKey(WS_A);
    const b = await resolver.resolveKey(WS_B);
    expect(a).not.toBe(b);
    expect(admin.budgetOf(b)).toBe(20);
  });

  it('chưa đặt trần → ngân sách mặc định', async () => {
    const { admin, ledger, resolver } = setup();
    ledger.setCap(WS_A, null);
    expect(admin.budgetOf(await resolver.resolveKey(WS_A))).toBe(5);
  });

  it('trần đổi → cập nhật khóa hiện có, không tạo khóa mới', async () => {
    const { admin, ledger, resolver } = setup();
    const k = await resolver.resolveKey(WS_A);
    ledger.setCap(WS_A, 30);
    expect(await resolver.resolveKey(WS_A)).toBe(k);
    expect(admin.budgetOf(k)).toBe(30);
    expect(admin.generateCount).toBe(1);
  });

  it('đua: 20 lần gọi đồng thời cùng workspace chỉ tạo một khóa', async () => {
    const { admin, resolver } = setup();
    const keys = await Promise.all(Array.from({ length: 20 }, () => resolver.resolveKey(WS_A)));
    expect(new Set(keys).size).toBe(1);
    expect(admin.generateCount).toBe(1);
  });

  it('khóa vượt ngân sách trên LiteLLM không ảnh hưởng workspace khác', async () => {
    const { admin, resolver } = setup();
    const a = await resolver.resolveKey(WS_A);
    const b = await resolver.resolveKey(WS_B);
    admin.recordSpend(a, 10);
    expect(admin.isExhausted(a)).toBe(true);
    expect(admin.isExhausted(b)).toBe(false);
  });

  it('property: n workspace → n khóa phân biệt, không khóa nào là khóa dùng chung', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 8 }), async (ids) => {
        const unique = [...new Set(ids.map((i) => i.toLowerCase()))];
        const { admin, ledger, resolver } = setup();
        for (const id of unique) ledger.setCap(id, 1);
        const keys = await Promise.all(unique.map((id) => resolver.resolveKey(id)));
        expect(new Set(keys).size).toBe(unique.length);
        expect(keys).not.toContain(SHARED);
        expect(admin.generateCount).toBe(unique.length);
      }),
    );
  });

  it('workspaceId sai → VALIDATION_FAILED', async () => {
    const { resolver } = setup();
    await expect(resolver.resolveKey('not-a-uuid')).rejects.toBeInstanceOf(AppError);
  });
});

describe('FR-034 đóng khi lỗi (không rơi về khóa dùng chung)', () => {
  const failing = () => Promise.reject(new Error('khóa vk-secret lộ'));

  it('admin.generate lỗi → AppError, không trả khóa chung, không lộ nội dung', async () => {
    const admin = { ...createMockKeyAdmin(), generate: failing } as unknown as VirtualKeyAdmin;
    const { resolver } = setup({ admin });
    const err = await resolver.resolveKey(WS_A).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(String((err as Error).message)).not.toContain('vk-secret');
  });

  it('ledger lỗi → AppError', async () => {
    const { resolver } = setup({ ledger: { read: failing } });
    await expect(resolver.resolveKey(WS_A)).rejects.toBeInstanceOf(AppError);
  });

  it('store lỗi → AppError', async () => {
    const store: VirtualKeyStore = { get: failing, put: failing };
    const { resolver } = setup({ store });
    await expect(resolver.resolveKey(WS_A)).rejects.toBeInstanceOf(AppError);
  });

  it('lưu khóa lỗi sau khi cấp → thu hồi khóa mồ côi; thu hồi lỗi cũng không đổi kết quả', async () => {
    const admin = createMockKeyAdmin();
    const store: VirtualKeyStore = { get: async () => null, put: failing };
    const { resolver } = setup({ admin, store });
    await expect(resolver.resolveKey(WS_A)).rejects.toBeInstanceOf(AppError);
    expect(admin.has('vk-mock-1')).toBe(false);

    const brokenRevoke: VirtualKeyAdmin = { ...admin, revoke: failing };
    const second = setup({ admin: brokenRevoke, store });
    await expect(second.resolver.resolveKey(WS_A)).rejects.toBeInstanceOf(AppError);
  });

  it('lỗi một lần không bị nhớ: lần sau thử lại được', async () => {
    let fail = true;
    const inner = createMockKeyAdmin();
    const admin: VirtualKeyAdmin = {
      generate: (spec) => (fail ? Promise.reject(new Error('x')) : inner.generate(spec)),
      update: inner.update,
      revoke: inner.revoke,
    };
    const { resolver } = setup({ admin });
    await expect(resolver.resolveKey(WS_A)).rejects.toBeInstanceOf(AppError);
    fail = false;
    await expect(resolver.resolveKey(WS_A)).resolves.not.toBe(SHARED);
  });

  it('bật mà thiếu ngân sách mặc định hợp lệ → VALIDATION_FAILED khi dựng', () => {
    expect(() => setup({ defaultBudgetUsd: Number.NaN })).toThrow(AppError);
  });
});

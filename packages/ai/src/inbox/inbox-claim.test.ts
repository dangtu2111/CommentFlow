import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CLAIM_TTL_MS,
  type ConversationClaimStore,
  claimKey,
  createConversationClaimService,
  createInMemoryClaimStore,
  decideClaim,
} from './inbox-claim';

const T0 = new Date('2026-11-06T03:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const WS = 'ws-1';
const CV = 'cv-1';

describe('FR-047 decideClaim — khóa chống trùng người xử lý', () => {
  it('chưa có khóa / hết hạn → nhận; cùng người → gia hạn; người khác → từ chối', () => {
    expect(decideClaim({ current: null, actor: 'a', now: T0, ttlMs: 1000 })).toEqual({
      action: 'acquire',
      next: { holder: 'a', expiresAt: T0.getTime() + 1000 },
    });
    const held = { holder: 'a', expiresAt: T0.getTime() + 1000 };
    expect(decideClaim({ current: held, actor: 'a', now: at(10), ttlMs: 1000 }).action).toBe(
      'renew',
    );
    expect(decideClaim({ current: held, actor: 'b', now: at(10), ttlMs: 1000 })).toEqual({
      action: 'deny',
      heldBy: 'a',
    });
    expect(decideClaim({ current: held, actor: 'b', now: at(1000), ttlMs: 1000 }).action).toBe(
      'acquire',
    );
    expect(decideClaim({ current: held, actor: 'b', now: at(999), ttlMs: 1000 }).action).toBe(
      'deny',
    );
  });
  it('property: khóa còn hạn thì người khác không bao giờ nhận được', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), (dt) => {
        const held = { holder: 'a', expiresAt: T0.getTime() + 1000 };
        expect(decideClaim({ current: held, actor: 'b', now: at(dt), ttlMs: 1000 }).action).toBe(
          'deny',
        );
      }),
      { seed: 50 },
    );
  });
});

describe('FR-047 claimKey', () => {
  it('chứa workspace_id; thành phần xấu → ném', () => {
    expect(claimKey(WS, CV)).toBe('sys:inbox:claim:ws-1:cv-1');
    expect(() => claimKey('a:b', CV)).toThrow();
    expect(() => claimKey(WS, '')).toThrow();
  });
  it('hai workspace cùng conversation id không đụng khóa', () => {
    expect(claimKey('w1', 'c')).not.toBe(claimKey('w2', 'c'));
  });
});

describe('FR-047 createConversationClaimService', () => {
  const make = (store: ConversationClaimStore = createInMemoryClaimStore(), now = () => T0) =>
    createConversationClaimService({ store, now });

  it('người đầu nhận, người sau bị từ chối kèm heldBy, hết hạn thì nhận', async () => {
    let clock = T0;
    const svc = make(undefined, () => clock);
    expect(await svc.claim(WS, CV, 'a')).toEqual({
      ok: true,
      expiresAt: new Date(T0.getTime() + CLAIM_TTL_MS),
    });
    expect(await svc.claim(WS, CV, 'b')).toEqual({ ok: false, reason: 'held', heldBy: 'a' });
    clock = at(CLAIM_TTL_MS);
    expect((await svc.claim(WS, CV, 'b')).ok).toBe(true);
  });
  it('cùng người gọi lại → gia hạn', async () => {
    let clock = T0;
    const svc = make(undefined, () => clock);
    await svc.claim(WS, CV, 'a');
    clock = at(60_000);
    expect(await svc.claim(WS, CV, 'a')).toEqual({
      ok: true,
      expiresAt: new Date(clock.getTime() + CLAIM_TTL_MS),
    });
  });
  it('chỉ chủ khóa nhả được; nhả xong người khác nhận', async () => {
    const svc = make();
    await svc.claim(WS, CV, 'a');
    expect(await svc.release(WS, CV, 'b')).toEqual({ released: false });
    expect(await svc.release(WS, CV, 'a')).toEqual({ released: true });
    expect(await svc.release(WS, CV, 'a')).toEqual({ released: false });
    expect((await svc.claim(WS, CV, 'b')).ok).toBe(true);
  });
  it('khóa theo workspace tách biệt', async () => {
    const svc = make();
    await svc.claim('w1', CV, 'a');
    expect((await svc.claim('w2', CV, 'b')).ok).toBe(true);
  });
  it('ca đua: hai người cùng lúc → đúng một người nhận', async () => {
    for (let i = 0; i < 20; i++) {
      const svc = make();
      const rs = await Promise.all([svc.claim(WS, CV, 'a'), svc.claim(WS, CV, 'b')]);
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
    }
  });
  it('lỗi store → từ chối (đóng), không ném', async () => {
    const broken: ConversationClaimStore = {
      async get() {
        throw new Error('down');
      },
      async compareAndSet() {
        throw new Error('down');
      },
    };
    const svc = make(broken);
    expect(await svc.claim(WS, CV, 'a')).toEqual({ ok: false, reason: 'store_error' });
    expect(await svc.release(WS, CV, 'a')).toEqual({ released: false });
  });
  it('CAS thua liên tục → store_error, không lặp vô hạn', async () => {
    const store: ConversationClaimStore = {
      async get() {
        return null;
      },
      async compareAndSet() {
        return false;
      },
    };
    expect(await make(store).claim(WS, CV, 'a')).toEqual({ ok: false, reason: 'store_error' });
  });
  it('mặc định dùng đồng hồ thật và ttl tùy chỉnh', async () => {
    const svc = createConversationClaimService({ store: createInMemoryClaimStore(), ttlMs: 5000 });
    const r = await svc.claim(WS, CV, 'a');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
  it('store bộ nhớ: CAS với giá trị cũ bị từ chối', async () => {
    const store = createInMemoryClaimStore();
    const k = claimKey(WS, CV);
    const a = { holder: 'a', expiresAt: 10 };
    expect(await store.compareAndSet(k, null, a)).toBe(true);
    expect(await store.compareAndSet(k, null, { holder: 'b', expiresAt: 20 })).toBe(false);
    expect(await store.compareAndSet(k, { holder: 'a', expiresAt: 11 }, null)).toBe(false);
    expect(await store.compareAndSet(k, { holder: 'a', expiresAt: 10 }, null)).toBe(true);
    expect(await store.get(k)).toBeNull();
  });
  it('actor rỗng → input_invalid', async () => {
    expect(await make().claim(WS, CV, '')).toEqual({ ok: false, reason: 'input_invalid' });
    expect(await make().release(WS, CV, '')).toEqual({ released: false });
  });
});

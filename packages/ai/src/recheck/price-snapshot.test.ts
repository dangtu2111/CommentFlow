import { buildPriceSnapshot } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { priceEntriesFromSnapshot, priceEntriesFromSources } from './price-snapshot';
import { sendRecheck } from './send-recheck';

const AT = new Date('2026-11-01T03:00:00.000Z');
const src = (over: Record<string, unknown> = {}) => ({
  productId: 'p1',
  variantId: null as string | null,
  priceVnd: 199_000 as number | null,
  stock: 5,
  updatedFromSourceAt: AT,
  ...over,
});

describe('priceEntriesFromSnapshot', () => {
  it('chuyển ảnh chụp (snake_case, JSON từ DB) thành mục R5, bỏ tồn kho', () => {
    const json = JSON.parse(JSON.stringify(buildPriceSnapshot([src({ variantId: 'v1' })])));
    expect(priceEntriesFromSnapshot(json)).toEqual([
      {
        productId: 'p1',
        variantId: 'v1',
        priceVnd: 199_000,
        updatedFromSourceAt: AT.toISOString(),
      },
    ]);
  });

  it('cột hỏng/không đọc được → rỗng (R5 sẽ chặn bằng price_snapshot_missing, không bỏ qua)', () => {
    expect(priceEntriesFromSnapshot({ not: 'array' })).toEqual([]);
    expect(priceEntriesFromSnapshot(null)).toEqual([]);
  });
});

describe('priceEntriesFromSources', () => {
  it('giá hiện tại: bỏ mục không giá, giữ biến thể', () => {
    expect(
      priceEntriesFromSources([src({ variantId: 'v1' }), src({ productId: 'p2', priceVnd: null })]),
    ).toEqual([{ productId: 'p1', variantId: 'v1', priceVnd: 199_000, updatedFromSourceAt: AT }]);
  });
});

describe('ảnh chụp ↔ sendRecheck R5 (đầu-cuối)', () => {
  const snapshotJson = JSON.parse(
    JSON.stringify(
      buildPriceSnapshot([src({ variantId: 'v1' }), src({ variantId: 'v2', priceVnd: 249_000 })]),
    ),
  );
  const run = (current: ReturnType<typeof src>[], snapshot: unknown = snapshotJson) =>
    sendRecheck({
      mode: 'human',
      target: 'comment',
      now: AT,
      comment: {
        status: 'sending',
        externalReplyId: null,
        isHidden: false,
        mergedIntoId: null,
        deletedAt: null,
      },
      channel: { status: 'connected', sendSuspended: false },
      automation: null,
      price: {
        hasMoney: true,
        snapshot: priceEntriesFromSnapshot(snapshot),
        current: priceEntriesFromSources(current),
      },
      kb: null,
      quota: null,
      message: null,
      rate: null,
    });

  it('biến thể không đổi → qua R5', () => {
    expect(run([src({ variantId: 'v1' }), src({ variantId: 'v2', priceVnd: 249_000 })]).ok).toBe(
      true,
    );
  });

  it('giá đúng biến thể v2 đổi (v1 giữ) → price_changed', () => {
    const r = run([src({ variantId: 'v1' }), src({ variantId: 'v2', priceVnd: 259_000 })]);
    expect(r).toMatchObject({ ok: false, reason: 'price_changed' });
  });

  it('biến thể v2 biến mất dù sản phẩm còn → price_changed', () => {
    expect(run([src({ variantId: 'v1' })])).toMatchObject({ ok: false, reason: 'price_changed' });
  });

  it('không có ảnh chụp → price_snapshot_missing', () => {
    expect(run([src({ variantId: 'v1' })], [])).toMatchObject({
      ok: false,
      reason: 'price_snapshot_missing',
    });
  });
});

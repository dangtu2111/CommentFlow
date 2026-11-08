import { describe, expect, it } from 'vitest';
import { decideBudget, KEY_SPEND_STOP_RATIO, readKeySpend, sumLedger } from './budget';

describe('decideBudget — dừng khi chạm trần', () => {
  const base = {
    perMeasurementCap: 1,
    totalCap: 5,
    measurementSpent: 0,
    ledgerSpent: 0,
    nextRunEstimate: 0.2,
    key: null,
  };

  it('còn trong mọi trần → chạy tiếp', () => {
    expect(decideBudget(base)).toEqual({ stop: false });
  });

  it('lượt kế tiếp (ước = lượt vừa rồi) làm vượt trần MỘT lần đo → dừng', () => {
    expect(decideBudget({ ...base, measurementSpent: 0.85 })).toMatchObject({
      stop: true,
      reason: 'per_measurement',
    });
    expect(decideBudget({ ...base, measurementSpent: 0.8 })).toEqual({ stop: false });
  });

  it('tổng sổ chi tiêu cộng lượt kế tiếp vượt trần cả chuỗi → dừng', () => {
    expect(decideBudget({ ...base, ledgerSpent: 4.9, measurementSpent: 0.1 })).toMatchObject({
      stop: true,
      reason: 'total',
    });
  });

  it('chi tiêu khóa ảo > 80% trần của khóa → dừng; đúng 80% thì chưa', () => {
    expect(decideBudget({ ...base, key: { spend: 81, maxBudget: 100 } })).toMatchObject({
      stop: true,
      reason: 'key_budget',
    });
    expect(decideBudget({ ...base, key: { spend: 80, maxBudget: 100 } })).toEqual({ stop: false });
    expect(KEY_SPEND_STOP_RATIO).toBe(0.8);
  });

  it('khóa không có trần hoặc không đọc được → không dừng theo khóa (chỉ theo trần cấu hình)', () => {
    expect(decideBudget({ ...base, key: { spend: 999, maxBudget: null } })).toEqual({
      stop: false,
    });
    expect(decideBudget({ ...base, key: null })).toEqual({ stop: false });
  });
});

describe('sumLedger', () => {
  it('cộng cột usd của các dòng JSONL hợp lệ, bỏ dòng hỏng/trống', () => {
    expect(sumLedger('{"usd":0.5}\n\nkhông phải json\n{"usd":1.25}\n{"x":1}\n')).toBeCloseTo(1.75);
    expect(sumLedger('')).toBe(0);
  });
});

describe('readKeySpend', () => {
  const fetchOk = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('đọc spend + max_budget từ /key/info bằng chính khóa dùng để chạy', async () => {
    let seen: { url?: string; auth?: string } = {};
    const fetchImpl = (async (url: string, init: { headers: Record<string, string> }) => {
      seen = { url, auth: init.headers.authorization };
      return new Response(JSON.stringify({ info: { spend: 12.5, max_budget: 50 } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    expect(await readKeySpend(fetchImpl, 'http://litellm.test:4000/', 'sk-test')).toEqual({
      spend: 12.5,
      maxBudget: 50,
    });
    expect(seen.url).toBe('http://litellm.test:4000/key/info');
    expect(seen.auth).toBe('Bearer sk-test');
  });

  it('lỗi mạng / HTTP lỗi / thiếu trường → null (không ném)', async () => {
    expect(await readKeySpend(fetchOk({}, 401), 'http://x', 'k')).toBeNull();
    expect(await readKeySpend(fetchOk({ info: {} }), 'http://x', 'k')).toBeNull();
    const boom = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect(await readKeySpend(boom, 'http://x', 'k')).toBeNull();
  });

  it('max_budget rỗng → maxBudget null', async () => {
    expect(
      await readKeySpend(fetchOk({ info: { spend: 3, max_budget: null } }), 'http://x', 'k'),
    ).toEqual({ spend: 3, maxBudget: null });
  });
});

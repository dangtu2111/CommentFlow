import { describe, expect, it } from 'vitest';
import { policyFactsFromRows } from './policy-rows';

const ship = {
  kind: 'nationwide',
  label: 'Toàn quốc',
  feeMinor: 30000,
  currency: 'VND',
  daysMin: 2,
  daysMax: 4,
  cod: true,
};
const row = (id: string, kind: string, data: unknown, status = 'approved') => ({
  id,
  kind,
  data,
  status,
});

describe('policyFactsFromRows — dòng DB đã duyệt → PolicyFacts của fact plan', () => {
  it('ánh xạ đủ các loại; nguồn của mỗi sự kiện là pf:<id> (truy được về dòng chính sách)', () => {
    const { policy, issues } = policyFactsFromRows([
      row('r1', 'ship_region', ship),
      row('r2', 'ship_region', {
        ...ship,
        kind: 'city',
        label: 'Nội thành HN',
        city: 'Hà Nội',
        cod: null,
      }),
      row('r3', 'cod', { value: false }),
      row('r4', 'returns', { days: 7 }),
      row('r5', 'warranty', { months: null, none: true }),
      row('r6', 'payment', { methods: ['cod', 'bank_transfer'] }),
    ]);
    expect(issues).toEqual([]);
    expect(policy.shipping).toEqual([
      {
        kind: 'nationwide',
        label: 'Toàn quốc',
        feeMinor: 30000,
        currency: 'VND',
        daysMin: 2,
        daysMax: 4,
        cod: true,
        sourceId: 'pf:r1',
      },
      {
        kind: 'city',
        label: 'Nội thành HN',
        city: 'Hà Nội',
        feeMinor: 30000,
        currency: 'VND',
        daysMin: 2,
        daysMax: 4,
        cod: null,
        sourceId: 'pf:r2',
      },
    ]);
    expect(policy.cod).toEqual({ value: false, sourceId: 'pf:r3' });
    expect(policy.returns).toEqual({ days: 7, none: false, sourceId: 'pf:r4' });
    expect(policy.warranty).toEqual({ months: null, none: true, sourceId: 'pf:r5' });
    expect(policy.payment).toEqual({ methods: ['cod', 'bank_transfer'], sourceId: 'pf:r6' });
  });

  it('BẢN NHÁP không bao giờ vào fact plan (kể cả khi truyền nhầm)', () => {
    const { policy } = policyFactsFromRows([
      row('d1', 'cod', { value: true }, 'draft'),
      row('d2', 'ship_region', ship, 'draft'),
    ]);
    expect(policy).toEqual({ shipping: [] });
  });

  it('dữ liệu hỏng/loại lạ bị bỏ và báo (không đoán, không làm sập)', () => {
    const { policy, issues } = policyFactsFromRows([
      row('b1', 'cod', { value: 'có' }),
      row('b2', 'ship_region', { ...ship, kind: 'city', city: undefined }),
      row('b3', 'loai_la', {}),
      row('ok', 'cod', { value: true }),
    ]);
    expect(policy.cod).toEqual({ value: true, sourceId: 'pf:ok' });
    expect(policy.shipping).toEqual([]);
    expect(issues).toEqual([
      'Chính sách pf:b1 (cod): dữ liệu không hợp lệ — bỏ qua.',
      'Chính sách pf:b2 (ship_region): dữ liệu không hợp lệ — bỏ qua.',
      'Chính sách pf:b3 (loai_la): dữ liệu không hợp lệ — bỏ qua.',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildPolicyFactsView,
  isEditedByOwner,
  isShipRegionRow,
  needsReview,
  type PolicyFactRowView,
} from './kb-policy-view';

const ship = {
  kind: 'nationwide',
  label: 'Toàn quốc',
  feeMinor: 30000,
  currency: 'VND',
  daysMin: 2,
  daysMax: 4,
};
const row = (over: Partial<PolicyFactRowView> = {}): PolicyFactRowView => ({
  id: 'r1',
  kind: 'ship_region',
  slot: 'toan quoc',
  data: ship,
  status: 'approved',
  origin: 'manual',
  evidence: null,
  sourceRef: null,
  rev: 1,
  ...over,
});
const cardOf = (view: ReturnType<typeof buildPolicyFactsView>, card: string) =>
  view.cards.find((c) => c.card === card);

describe('buildPolicyFactsView', () => {
  it('không có dòng nào: bốn thẻ trống, độ phủ none, 0 nháp', () => {
    const view = buildPolicyFactsView([]);
    expect(view.cards.map((c) => [c.card, c.coverage, c.entries.length])).toEqual([
      ['ship', 'none', 0],
      ['returns', 'none', 0],
      ['warranty', 'none', 0],
      ['payment', 'none', 0],
    ]);
    expect(view.pendingCount).toBe(0);
  });

  it('ghép bản đã duyệt và bản nháp cùng (kind, slot); độ phủ theo bản đã duyệt', () => {
    const view = buildPolicyFactsView([
      row({ id: 'a' }),
      row({ id: 'd', status: 'draft', origin: 'shopify_suggested', evidence: 'Phí 30.000đ' }),
    ]);
    const entries = cardOf(view, 'ship')?.entries ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.approved?.id).toBe('a');
    expect(entries[0]?.draft?.id).toBe('d');
    expect(cardOf(view, 'ship')?.coverage).toBe('approved');
    expect(view.pendingCount).toBe(1);
  });

  it('chỉ có nháp → coverage draft; returns/warranty/payment vào đúng thẻ; COD chung vào thẻ Ship', () => {
    const view = buildPolicyFactsView([
      row({
        id: 'r',
        kind: 'returns',
        slot: 'returns',
        data: { days: 7 },
        status: 'draft',
        origin: 'text_suggested',
        evidence: 'Đổi trả 7 ngày',
      }),
      row({ id: 'w', kind: 'warranty', slot: 'warranty', data: { months: 3 } }),
      row({ id: 'p', kind: 'payment', slot: 'payment', data: { methods: ['cod'] } }),
      row({ id: 'c', kind: 'cod', slot: 'cod', data: { value: true } }),
    ]);
    expect(cardOf(view, 'returns')?.coverage).toBe('draft');
    expect(cardOf(view, 'warranty')?.coverage).toBe('approved');
    expect(cardOf(view, 'payment')?.coverage).toBe('approved');
    expect(cardOf(view, 'ship')?.entries.map((e) => e.approved?.kind)).toEqual(['cod']);
  });

  it('bỏ dòng có data sai cấu trúc (không đếm nháp, không hiện)', () => {
    const view = buildPolicyFactsView([
      row({ id: 'bad', status: 'draft', data: { kind: 'city' } }),
      row({ id: 'ok', slot: 'a' }),
    ]);
    expect(cardOf(view, 'ship')?.entries).toHaveLength(1);
    expect(view.pendingCount).toBe(0);
  });

  it('sắp xếp các khu vực theo slot (ổn định)', () => {
    const view = buildPolicyFactsView([
      row({
        id: '2',
        slot: 'noi thanh ha noi',
        data: { ...ship, label: 'Nội thành Hà Nội', kind: 'city', city: 'Hà Nội' },
      }),
      row({ id: '1', slot: 'toan quoc' }),
    ]);
    expect(cardOf(view, 'ship')?.entries.map((e) => e.slot)).toEqual([
      'noi thanh ha noi',
      'toan quoc',
    ]);
  });
});

describe('dấu hiệu của từng dòng', () => {
  it('isEditedByOwner: nháp manual còn trích dẫn của máy; bản duyệt hoặc nháp tay thuần thì không', () => {
    expect(isEditedByOwner(row({ status: 'draft', origin: 'manual', evidence: 'x' }))).toBe(true);
    expect(isEditedByOwner(row({ status: 'draft', origin: 'manual', evidence: null }))).toBe(false);
    expect(isEditedByOwner(row({ status: 'approved', origin: 'manual', evidence: 'x' }))).toBe(
      false,
    );
    expect(
      isEditedByOwner(row({ status: 'draft', origin: 'shopify_suggested', evidence: 'x' })),
    ).toBe(false);
  });

  it('needsReview đọc cờ trong data; isShipRegionRow phân biệt khu vực với COD chung', () => {
    expect(needsReview(row({ data: { days: 7, needsReview: true } }))).toBe(true);
    expect(needsReview(row({ data: { days: 7 } }))).toBe(false);
    expect(needsReview(row({ data: null }))).toBe(false);
    expect(isShipRegionRow(row())).toBe(true);
    expect(isShipRegionRow(row({ kind: 'cod' }))).toBe(false);
  });
});

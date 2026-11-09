import { parsePolicyFactData } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { suggestPolicyFacts, valueAppearsInEvidence } from './suggest';

const one = (text: string, kind: string) => suggestPolicyFacts(text).find((s) => s.kind === kind);

describe('suggestPolicyFacts — chỉ đề xuất khi số có nguyên văn trong câu bằng chứng', () => {
  it('đổi trả: số ngày; "không đổi trả" → none; ngưỡng/mơ hồ → bỏ', () => {
    expect(one('Shop hỗ trợ đổi trả trong 7 ngày kể từ khi nhận hàng.', 'returns')?.data).toEqual({
      days: 7,
    });
    expect(one('Return within 14 days of delivery.', 'returns')?.data).toEqual({ days: 14 });
    expect(one('Sản phẩm giảm giá không đổi trả.', 'returns')?.data).toEqual({
      days: null,
      none: true,
    });
    expect(one('Đổi trả từ 7 đến 14 ngày tùy loại hàng.', 'returns')).toBeUndefined();
  });

  it('bảo hành: tháng, năm → tháng, không bảo hành', () => {
    expect(one('Bảo hành chính hãng 12 tháng.', 'warranty')?.data).toEqual({ months: 12 });
    expect(one('Bảo hành 2 năm cho thân máy.', 'warranty')?.data).toEqual({
      months: 24,
      scope: 'thân máy',
    });
    expect(one('Hàng thanh lý không bảo hành.', 'warranty')?.data).toEqual({
      months: null,
      none: true,
    });
  });

  it('COD: có / không', () => {
    expect(one('Shop nhận thanh toán khi nhận hàng (COD) toàn quốc.', 'cod')?.data).toEqual({
      value: true,
    });
    expect(one('Hiện shop không hỗ trợ COD.', 'cod')?.data).toEqual({ value: false });
  });

  it('ship toàn quốc: phí + số ngày; k/đ; mơ hồ/ngưỡng/miễn phí có điều kiện → bỏ', () => {
    const s = one('Phí ship toàn quốc 30.000đ, giao trong 2-4 ngày.', 'ship_region');
    expect(s?.data).toMatchObject({
      kind: 'nationwide',
      feeMinor: 30000,
      daysMin: 2,
      daysMax: 4,
      currency: 'VND',
    });
    expect(one('Phí vận chuyển toàn quốc 25k, giao 3 ngày.', 'ship_region')?.data).toMatchObject({
      feeMinor: 25000,
      daysMin: 3,
      daysMax: 3,
    });
    expect(one('Miễn phí ship cho đơn từ 500.000đ.', 'ship_region')).toBeUndefined();
    expect(one('Phí ship 30.000đ hoặc 45.000đ tùy khu vực.', 'ship_region')).toBeUndefined();
    expect(one('Phí ship 30.000đ.', 'ship_region')).toBeUndefined(); // không nói toàn quốc / nội thành → không đoán
  });

  it('ship nội thành cần chữ "nội thành"; tỉnh không rõ kiểu → bỏ', () => {
    const s = one('Ship nội thành Hà Nội 20.000đ, giao trong 1 ngày.', 'ship_region');
    expect(s?.data).toMatchObject({ kind: 'city', city: 'Hà Nội', feeMinor: 20000 });
    expect(one('Ship Đà Nẵng 35.000đ, giao 2 ngày.', 'ship_region')).toBeUndefined();
  });

  it('mọi đề xuất qua được Zod và mang nguyên văn câu làm bằng chứng', () => {
    const text =
      'Phí ship toàn quốc 30.000đ, giao trong 2-4 ngày. Đổi trả trong 7 ngày. Bảo hành 12 tháng. Nhận COD.';
    const all = suggestPolicyFacts(text);
    expect(all.map((s) => s.kind).sort()).toEqual(['cod', 'returns', 'ship_region', 'warranty']);
    for (const s of all) {
      expect(parsePolicyFactData(s.kind, s.data).success).toBe(true);
      expect(text).toContain(s.evidence);
    }
  });

  it('hai câu mâu thuẫn cùng loại → bỏ cả hai; hai câu cùng giá trị → giữ', () => {
    expect(
      one('Đổi trả trong 7 ngày. Ngoài ra đổi trả trong 14 ngày với hàng lỗi.', 'returns'),
    ).toBeUndefined();
    expect(one('Đổi trả trong 7 ngày. Chính sách đổi trả: 7 ngày.', 'returns')?.data).toEqual({
      days: 7,
    });
  });

  it('điều kiện/phạm vi chỉ chép NGUYÊN VĂN; "kể từ khi nhận hàng" không phải điều kiện', () => {
    expect(
      one('Đổi trả trong 7 ngày nếu sản phẩm còn tem mác và chưa giặt.', 'returns')?.data,
    ).toEqual({
      days: 7,
      conditions: ['còn tem mác', 'chưa giặt'],
    });
    expect(
      one(
        'Returns are accepted within 7 days if the item still has its tags and is unwashed.',
        'returns',
      )?.data,
    ).toEqual({
      days: 7,
      conditions: ['still has its tags', 'is unwashed'],
    });
    expect(one('Đổi trả trong 7 ngày kể từ khi nhận hàng.', 'returns')?.data).toEqual({ days: 7 });
    expect(one('Bảo hành đường may 3 tháng kể từ ngày nhận hàng.', 'warranty')?.data).toEqual({
      months: 3,
      scope: 'đường may',
    });
    expect(
      one('Seams are under warranty for 3 months from the delivery date.', 'warranty')?.data,
    ).toEqual({ months: 3, scope: 'Seams' });
    expect(one('Warranty on seams for 3 months.', 'warranty')?.data).toEqual({
      months: 3,
      scope: 'seams',
    });
    expect(one('Bảo hành chính hãng 12 tháng cho sản phẩm.', 'warranty')?.data).toEqual({
      months: 12,
    });
    for (const text of [
      'Đổi trả trong 7 ngày nếu sản phẩm còn tem mác.',
      'Bảo hành đường may 3 tháng.',
    ]) {
      const evidence = suggestPolicyFacts(text)[0]?.evidence ?? '';
      const data = suggestPolicyFacts(text)[0]?.data as { conditions?: string[]; scope?: string };
      for (const part of [...(data.conditions ?? []), ...(data.scope ? [data.scope] : [])])
        expect(evidence).toContain(part);
    }
  });

  it('điều kiện/phạm vi mà không tách được → nháp gắn needsReview (không bỏ trống điều kiện)', () => {
    expect(one('Đổi trả trong 7 ngày, trừ hàng giảm giá.', 'returns')?.data).toMatchObject({
      days: 7,
      needsReview: true,
    });
    expect(one('Đổi trả trong 7 ngày nếu.', 'returns')?.data).toMatchObject({ days: 7 });
    expect(one('Bảo hành 12 tháng, không bao gồm phụ kiện.', 'warranty')?.data).toMatchObject({
      months: 12,
      needsReview: true,
    });
  });

  it('valueAppearsInEvidence', () => {
    expect(valueAppearsInEvidence([30000], 'Phí 30.000đ')).toBe(true);
    expect(valueAppearsInEvidence([25], 'Phí 30.000đ')).toBe(false);
  });
});

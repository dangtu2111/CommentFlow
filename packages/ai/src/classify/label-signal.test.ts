import { describe, expect, it } from 'vitest';
import {
  consistencyOf,
  labelProbabilityFromLogprobs,
  resolveLabelProbability,
} from './label-signal';

describe('09 §6.0 p_label: ml → logprob → tự nhất quán → null', () => {
  it('đúng thứ tự ưu tiên', () => {
    expect(resolveLabelProbability({ ml: 0.9, logprob: 0.5, consistency: 1 })).toEqual({
      pLabel: 0.9,
      source: 'ml',
    });
    expect(resolveLabelProbability({ ml: null, logprob: 0.5, consistency: 1 })).toEqual({
      pLabel: 0.5,
      source: 'logprob',
    });
    expect(resolveLabelProbability({ consistency: 0.5 })).toEqual({
      pLabel: 0.5,
      source: 'self_consistency',
    });
  });

  it('không có tín hiệu hợp lệ → null, KHÔNG đoán; số ngoài [0,1]/NaN bị bỏ', () => {
    const none = { pLabel: null, source: null };
    expect(resolveLabelProbability(undefined)).toEqual(none);
    expect(resolveLabelProbability({})).toEqual(none);
    expect(resolveLabelProbability({ ml: 1.5, logprob: Number.NaN, consistency: -1 })).toEqual(
      none,
    );
  });

  it('consistencyOf: tỉ lệ trùng nhãn chính với lần đầu', () => {
    expect(consistencyOf([])).toBeNull();
    expect(consistencyOf(['price'])).toBe(1);
    expect(consistencyOf(['price', 'price'])).toBe(1);
    expect(consistencyOf(['price', 'advice'])).toBe(0.5);
  });
});

describe('labelProbabilityFromLogprobs', () => {
  const tokens = (parts: Array<[string, number]>) =>
    parts.map(([token, logprob]) => ({ token, logprob }));

  it('tích xác suất các token nằm trong giá trị nhãn chính', () => {
    const t = tokens([
      ['{"labels":[{"label": "', -0.01],
      ['pri', Math.log(0.8)],
      ['ce', Math.log(0.5)],
      ['"}]}', -0.2],
    ]);
    expect(labelProbabilityFromLogprobs(t, 'price')).toBeCloseTo(0.4, 5);
  });

  it('không có logprob / không thấy nhãn / nhãn lạ → null', () => {
    expect(labelProbabilityFromLogprobs(undefined, 'price')).toBeNull();
    expect(labelProbabilityFromLogprobs([], 'price')).toBeNull();
    expect(labelProbabilityFromLogprobs(tokens([['{"x": 1}', -0.1]]), 'price')).toBeNull();
    expect(labelProbabilityFromLogprobs(tokens([['{"label":"price"}', -0.1]]), 'a.b')).toBeNull();
  });

  it('chỉ tính nhãn đầu tiên có đúng giá trị, bỏ qua "label" của nhãn khác', () => {
    const t = tokens([
      ['{"labels":[{"label":"', -0.1],
      ['advice', Math.log(0.6)],
      ['"},{"label":"', -0.1],
      ['price', Math.log(0.3)],
      ['"}]}', -0.1],
    ]);
    expect(labelProbabilityFromLogprobs(t, 'price')).toBeCloseTo(0.3, 5);
    expect(labelProbabilityFromLogprobs(t, 'advice')).toBeCloseTo(0.6, 5);
  });
});

import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { hasLabel, parseExtractOutput, primaryLabel } from './extract-result';

const base = {
  labels: [{ label: 'price', confidence: 0.9 }],
  product_mentions: [],
  refers_to_image: false,
  size: null,
  color: null,
  height_cm: null,
  weight_kg: null,
  qty: null,
  cited_price_vnd: null,
  order_intent: null,
  asks: [],
};
const json = (over: Record<string, unknown> = {}) => JSON.stringify({ ...base, ...over });

function failure(text: string): unknown {
  try {
    parseExtractOutput(text);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('FR-162 đọc đầu ra extract', () => {
  it('đọc object đủ trường', () => {
    const r = parseExtractOutput(
      json({
        product_mentions: ['áo thun'],
        size: 'M',
        color: 'đen',
        height_cm: 165,
        weight_kg: 55,
        qty: 2,
        cited_price_vnd: 199000,
        asks: ['giá', 'size'],
        order_intent: { items: ['áo thun'], phone: null, address: '12 Lê Lợi' },
      }),
    );
    expect(r.size).toBe('M');
    expect(r.cited_price_vnd).toBe(199000);
    expect(r.order_intent?.address).toBe('12 Lê Lợi');
  });

  it('bỏ hàng rào ```json và chữ thừa quanh object', () => {
    expect(parseExtractOutput(`\`\`\`json\n${json()}\n\`\`\``).labels[0]?.label).toBe('price');
    expect(parseExtractOutput(`Kết quả: ${json()} xong.`).labels[0]?.label).toBe('price');
  });

  it('thiếu trường bắt buộc, sai kiểu, số âm hoặc số lẻ ở qty → LLM_UNAVAILABLE', () => {
    const { asks: _omit, ...missing } = base;
    for (const text of [
      JSON.stringify(missing),
      json({ qty: -1 }),
      json({ qty: 1.5 }),
      json({ height_cm: 'cao' }),
      json({ labels: [{ label: 'giá', confidence: 0.5 }] }),
      json({ labels: [{ label: 'price', confidence: 1.5 }] }),
    ]) {
      const e = failure(text);
      expect(isAppError(e) && e.code).toBe('LLM_UNAVAILABLE');
    }
  });

  it('không phải JSON / rỗng → LLM_UNAVAILABLE, thông báo không chứa nội dung', () => {
    for (const text of [
      '',
      'xin chào khach-bi-mat-99',
      '{ hỏng',
      '{ hỏng: khach-bi-mat-99 }',
      '```json\n```',
    ]) {
      const e = failure(text);
      expect(isAppError(e) && e.code).toBe('LLM_UNAVAILABLE');
      expect(String((e as Error).message)).not.toContain('khach-bi-mat-99');
    }
  });

  it('phone do LLM trả luôn bị bỏ (số thật do bước che PII giữ)', () => {
    const r = parseExtractOutput(
      json({ order_intent: { items: ['áo'], phone: '0901234567', address: null } }),
    );
    expect(r.order_intent?.phone).toBeNull();
  });

  it('chuỗi rỗng/khoảng trắng ở size, color, mention, asks bị gọt hoặc bỏ', () => {
    const r = parseExtractOutput(
      json({ size: '  ', color: ' đỏ ', product_mentions: [' ', 'váy '], asks: [''] }),
    );
    expect(r.size).toBeNull();
    expect(r.color).toBe('đỏ');
    expect(r.product_mentions).toEqual(['váy']);
    expect(r.asks).toEqual([]);
  });
});

describe('FR-145 labels[]', () => {
  const labels = (list: [string, number][]) =>
    parseExtractOutput(json({ labels: list.map(([label, confidence]) => ({ label, confidence })) }))
      .labels;

  it('sắp giảm dần theo độ tin cậy, nhãn chính là phần tử đầu', () => {
    const r = parseExtractOutput(
      json({
        labels: [
          { label: 'advice', confidence: 0.3 },
          { label: 'purchase', confidence: 0.8 },
        ],
      }),
    );
    expect(r.labels.map((l) => l.label)).toEqual(['purchase', 'advice']);
    expect(primaryLabel(r)).toBe('purchase');
  });

  it('khử trùng, giữ độ tin cậy cao nhất', () => {
    expect(
      labels([
        ['price', 0.2],
        ['price', 0.7],
      ]),
    ).toEqual([{ label: 'price', confidence: 0.7 }]);
  });

  it('hòa điểm giữ thứ tự mô hình trả', () => {
    expect(
      labels([
        ['advice', 0.5],
        ['spam', 0.5],
      ]).map((l) => l.label),
    ).toEqual(['advice', 'spam']);
  });

  it('danh sách rỗng → LLM_UNAVAILABLE', () => {
    const e = failure(json({ labels: [] }));
    expect(isAppError(e) && e.code).toBe('LLM_UNAVAILABLE');
  });

  it('hasLabel thấy Khiếu nại ở bất kỳ vị trí nào', () => {
    const r = parseExtractOutput(
      json({
        labels: [
          { label: 'price', confidence: 0.9 },
          { label: 'complaint', confidence: 0.2 },
        ],
      }),
    );
    expect(hasLabel(r, 'complaint')).toBe(true);
    expect(hasLabel(r, 'spam')).toBe(false);
  });
});

import { maskPii } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from './fixture-extractor';

const WS = '11111111-1111-4111-8111-111111111111';
const ask = (text: string) => ({ workspaceId: WS, text: maskPii(text) });

describe('FR-027 bản mock theo fixture', () => {
  const extractor = createFixtureExtractor([
    {
      match: /giá/i,
      result: { ...FIXTURE_EXTRACT_DEFAULT, labels: [{ label: 'price', confidence: 0.95 }] },
    },
  ]);
  it('khớp fixture → trả kết quả cố định', async () => {
    expect((await extractor.extract(ask('Áo này GIÁ bao nhiêu?'))).labels[0]?.label).toBe('price');
  });
  it('không khớp → nhãn other, không ném lỗi', async () => {
    expect(await extractor.extract(ask('xin chào'))).toEqual(FIXTURE_EXTRACT_DEFAULT);
    expect(FIXTURE_EXTRACT_DEFAULT.labels[0]?.label).toBe('other');
  });
  it('không có fixture nào vẫn chạy', async () => {
    expect((await createFixtureExtractor().extract(ask('abc'))).labels).toHaveLength(1);
  });
});

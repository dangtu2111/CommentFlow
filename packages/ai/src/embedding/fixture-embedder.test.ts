import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS } from './embedder';
import { createFixtureEmbedder, FIXTURE_EMBEDDING_MODEL } from './fixture-embedder';

const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);

describe('FR-127 fixture embedder (mock, không gọi mạng)', () => {
  const embedder = createFixtureEmbedder();

  it('1024 chiều, độ dài 1, tên model fixture', async () => {
    const [v] = await embedder.embed(['áo len']);
    expect(embedder.model).toBe(FIXTURE_EMBEDDING_MODEL);
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(Math.sqrt(dot(v ?? [], v ?? []))).toBeCloseTo(1, 6);
  });
  it('xác định: cùng chữ → cùng vector; theo lô giữ thứ tự', async () => {
    const [a, b] = await embedder.embed(['quần jean', 'áo thun']);
    const [a2] = await embedder.embed(['quần jean']);
    expect(a).toEqual(a2);
    expect(a).not.toEqual(b);
  });
  it('không dấu/hoa thường như nhau; chữ gần giống cosine cao hơn chữ khác', async () => {
    const [q, near, far, same] = await embedder.embed([
      'ao len xah',
      'áo len xanh',
      'quần short kaki',
      'AO LEN XAH',
    ]);
    expect(same).toEqual(q);
    expect(dot(q ?? [], near ?? [])).toBeGreaterThan(dot(q ?? [], far ?? []));
  });
  it('chuỗi rỗng → vector 0 (không chia cho 0); lô rỗng → rỗng', async () => {
    const [v] = await embedder.embed(['']);
    expect(v?.every((x) => x === 0)).toBe(true);
    expect(await embedder.embed([])).toEqual([]);
  });
});

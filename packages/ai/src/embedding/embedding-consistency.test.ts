import { describe, expect, it } from 'vitest';
import { evaluateEmbeddingConsistency, vectorBranchUsable } from './embedding-consistency';

const M = 'bge-m3';

describe('chặn lệch model embedding (FR-133): so model cấu hình với dữ liệu đã lưu', () => {
  it('khớp hoàn toàn → ok, dùng được nhánh vector', () => {
    const s = evaluateEmbeddingConsistency({
      configuredModel: M,
      chunks: [{ model: M, count: 30 }],
      products: [{ model: M, count: 40 }],
    });
    expect(s.state).toBe('ok');
    expect(vectorBranchUsable(s)).toBe(true);
  });

  it('chưa có vector nào → empty: không lệch, nhánh vector dùng được (chưa có gì để so)', () => {
    const s = evaluateEmbeddingConsistency({ configuredModel: M, chunks: [], products: [] });
    expect(s.state).toBe('empty');
    expect(vectorBranchUsable(s)).toBe(true);
  });

  it('đoạn kiến thức khác model → mismatch, nêu nguồn + model + số lượng, TẮT nhánh vector', () => {
    const s = evaluateEmbeddingConsistency({
      configuredModel: M,
      chunks: [
        { model: 'fixture-trigram-1024', count: 12 },
        { model: M, count: 3 },
      ],
      products: [],
    });
    expect(s.state).toBe('mismatch');
    expect(s.mismatches).toEqual([
      { source: 'kb_chunks', model: 'fixture-trigram-1024', count: 12 },
    ]);
    expect(vectorBranchUsable(s)).toBe(false);
  });

  it('vector tên sản phẩm không rõ model (NULL, ghi trước khi có cột) → coi là lệch, không đoán', () => {
    const s = evaluateEmbeddingConsistency({
      configuredModel: M,
      chunks: [{ model: M, count: 3 }],
      products: [{ model: '', count: 5 }],
    });
    expect(s.state).toBe('mismatch');
    expect(s.mismatches).toEqual([{ source: 'products', model: '', count: 5 }]);
  });

  it('không cấu hình embedding (off) → off: nhánh vector tắt, không báo lệch', () => {
    const s = evaluateEmbeddingConsistency({
      configuredModel: null,
      chunks: [{ model: M, count: 3 }],
      products: [],
    });
    expect(s.state).toBe('off');
    expect(s.mismatches).toEqual([]);
    expect(vectorBranchUsable(s)).toBe(false);
  });

  it('đổi cấu hình sang model khác khi dữ liệu còn model cũ → lệch cả hai nguồn', () => {
    const s = evaluateEmbeddingConsistency({
      configuredModel: 'bge-m3-v2',
      chunks: [{ model: M, count: 3 }],
      products: [{ model: M, count: 4 }],
    });
    expect(s.state).toBe('mismatch');
    expect(s.mismatches.map((m) => m.source)).toEqual(['kb_chunks', 'products']);
  });
});

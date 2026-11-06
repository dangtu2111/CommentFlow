import { describe, expect, it, vi } from 'vitest';
import { executeRoute } from './execute-route';

function branches() {
  return {
    sql: vi.fn(async () => ['variant']),
    hybrid: vi.fn(async () => ['chunk']),
  };
}

describe('FR-136 executeRoute — chạy đúng nhánh', () => {
  it('sql: chỉ tra DB, KHÔNG gọi hybrid (không vector/rerank)', async () => {
    const b = branches();
    const result = await executeRoute('sql', b);
    expect(result).toEqual({ route: 'sql', sql: ['variant'] });
    expect(b.sql).toHaveBeenCalledTimes(1);
    expect(b.hybrid).not.toHaveBeenCalled();
  });

  it('hybrid: chỉ hybrid, không tra biến thể', async () => {
    const b = branches();
    const result = await executeRoute('hybrid', b);
    expect(result).toEqual({ route: 'hybrid', hybrid: ['chunk'] });
    expect(b.sql).not.toHaveBeenCalled();
    expect(b.hybrid).toHaveBeenCalledTimes(1);
  });

  it('both: gọi cả hai, mỗi nhánh một lần', async () => {
    const b = branches();
    const result = await executeRoute('both', b);
    expect(result).toEqual({ route: 'both', sql: ['variant'], hybrid: ['chunk'] });
    expect(b.sql).toHaveBeenCalledTimes(1);
    expect(b.hybrid).toHaveBeenCalledTimes(1);
  });

  it('lỗi một nhánh được ném ra (không nuốt lỗi)', async () => {
    const b = branches();
    b.sql.mockRejectedValueOnce(new Error('db down'));
    await expect(executeRoute('both', b)).rejects.toThrow('db down');
  });
});

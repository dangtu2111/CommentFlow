import { describe, expect, it } from 'vitest';
import { KB_REEMBED_BATCH_MAX } from './kb-reembed';

describe('KB_REEMBED_BATCH_MAX', () => {
  it('trần lô gọi embedder/ghi DB khi tạo vector mới là số dương hữu hạn', () => {
    expect(Number.isInteger(KB_REEMBED_BATCH_MAX)).toBe(true);
    expect(KB_REEMBED_BATCH_MAX).toBeGreaterThan(0);
    expect(KB_REEMBED_BATCH_MAX).toBeLessThanOrEqual(256);
  });
});

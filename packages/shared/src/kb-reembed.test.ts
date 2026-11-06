import { describe, expect, it } from 'vitest';
import { KB_REEMBED_BATCH_MAX, KB_REEMBED_QUEUE, kbReembedJobSchema } from './kb-reembed';

describe('FR-133 kbReembedJobSchema', () => {
  const workspaceId = '00000000-0000-4000-8000-000000000001';
  it('chỉ nhận workspaceId (không mang nội dung kiến thức)', () => {
    expect(kbReembedJobSchema.parse({ workspaceId })).toEqual({ workspaceId });
    expect(kbReembedJobSchema.safeParse({ workspaceId: 'x' }).success).toBe(false);
    expect(kbReembedJobSchema.safeParse({}).success).toBe(false);
  });
  it('hằng số', () => {
    expect(KB_REEMBED_QUEUE).toBe('kb-reembed');
    expect(KB_REEMBED_BATCH_MAX).toBeGreaterThan(0);
  });
});

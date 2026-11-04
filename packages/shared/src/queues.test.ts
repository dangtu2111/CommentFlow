import { describe, expect, it } from 'vitest';
import { INGEST_QUEUE, ingestJobSchema } from './queues';

const uuid = '11111111-1111-4111-8111-111111111111';

describe('FR-020 job ingest — dữ liệu job', () => {
  it('FR-020 tên hàng đợi cố định và chỉ nhận {workspaceId, eventId} là UUID', () => {
    expect(INGEST_QUEUE).toBe('ingest');
    expect(ingestJobSchema.safeParse({ workspaceId: uuid, eventId: uuid }).success).toBe(true);
  });

  it('FR-020 từ chối thiếu trường/không phải UUID (không nhận nội dung bình luận trong job)', () => {
    for (const bad of [
      {},
      { workspaceId: uuid },
      { eventId: uuid },
      { workspaceId: 'x', eventId: uuid },
    ]) {
      expect(ingestJobSchema.safeParse(bad).success).toBe(false);
    }
  });
});

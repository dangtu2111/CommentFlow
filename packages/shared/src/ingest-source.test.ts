import { describe, expect, it } from 'vitest';
import { INGEST_SOURCES, ingestSourceOf } from './ingest-source';

describe('ingestSourceOf — nguồn của sự kiện bình luận (payload.source; Q-POR1)', () => {
  it('có đúng ba nguồn', () => {
    expect([...INGEST_SOURCES]).toEqual(['webhook', 'polling', 'backfill']);
  });

  it('không có source (webhook trực tiếp) → webhook', () => {
    expect(ingestSourceOf({ kind: 'comment_created' })).toBe('webhook');
    expect(ingestSourceOf({})).toBe('webhook');
  });

  it('polling / backfill được nhận đúng', () => {
    expect(ingestSourceOf({ source: 'polling' })).toBe('polling');
    expect(ingestSourceOf({ source: 'backfill' })).toBe('backfill');
  });

  it('giá trị lạ/sai kiểu/payload hỏng → webhook (không bao giờ ném, không nhận chuỗi tùy ý)', () => {
    for (const payload of [
      { source: 'hack' },
      { source: 5 },
      { source: null },
      null,
      undefined,
      'x',
      7,
      [],
    ]) {
      expect(ingestSourceOf(payload)).toBe('webhook');
    }
  });
});

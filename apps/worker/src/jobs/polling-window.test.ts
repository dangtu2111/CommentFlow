import { describe, expect, it } from 'vitest';
import {
  BACKFILL_DAYS,
  backfillSince,
  isBackfillDays,
  MAX_POLL_LOOKBACK_MS,
  POLL_OVERLAP_MS,
  pollSince,
  WEBHOOK_GRACE_MS,
} from './polling-window';

const NOW = new Date('2026-11-06T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('FR-023 cửa sổ quét bù', () => {
  it('FR-023 lần đầu (chưa quét) = 7 ngày trước', () => {
    expect(pollSince(null, NOW).getTime()).toBe(NOW.getTime() - 7 * DAY);
    expect(MAX_POLL_LOOKBACK_MS).toBe(7 * DAY);
  });

  it('FR-023 các lần sau = last_polled_at trừ phần chồng 15 phút', () => {
    const last = new Date(NOW.getTime() - 5 * 60 * 1000);
    expect(pollSince(last, NOW).getTime()).toBe(last.getTime() - POLL_OVERLAP_MS);
    expect(POLL_OVERLAP_MS).toBe(15 * 60 * 1000);
  });

  it('FR-023 không bao giờ cũ hơn 7 ngày, kể cả khi lâu không quét; mốc đúng 7 ngày giữ nguyên', () => {
    const stale = new Date(NOW.getTime() - 30 * DAY);
    expect(pollSince(stale, NOW).getTime()).toBe(NOW.getTime() - 7 * DAY);
    const edge = new Date(NOW.getTime() - 7 * DAY + POLL_OVERLAP_MS);
    expect(pollSince(edge, NOW).getTime()).toBe(NOW.getTime() - 7 * DAY);
  });

  it('FR-023 mốc tương lai (lệch giờ) bị kẹp về bây giờ trừ chồng, không đi tới', () => {
    const future = new Date(NOW.getTime() + DAY);
    expect(pollSince(future, NOW).getTime()).toBe(NOW.getTime() - POLL_OVERLAP_MS);
  });

  it('FR-023 chờ webhook 5 phút', () => {
    expect(WEBHOOK_GRACE_MS).toBe(5 * 60 * 1000);
  });
});

describe('FR-011 cửa sổ backfill khi kết nối', () => {
  it('FR-011 chỉ nhận 3/7/30 ngày', () => {
    expect([...BACKFILL_DAYS]).toEqual([3, 7, 30]);
    for (const ok of [3, 7, 30]) expect(isBackfillDays(ok)).toBe(true);
    for (const bad of [0, 1, 2, 29, 31, -3, 7.5, Number.NaN, '7', null, undefined]) {
      expect(isBackfillDays(bad)).toBe(false);
    }
  });

  it('FR-011 backfillSince = bây giờ trừ N ngày', () => {
    expect(backfillSince(3, NOW).getTime()).toBe(NOW.getTime() - 3 * DAY);
    expect(backfillSince(30, NOW).getTime()).toBe(NOW.getTime() - 30 * DAY);
  });
});

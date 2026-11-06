import { describe, expect, it } from 'vitest';
import { messengerSendMode } from './window';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const last = new Date('2026-11-01T00:00:00Z');
const at = (ms: number) => new Date(last.getTime() + ms);
const mode = (elapsedMs: number, byHuman: boolean) =>
  messengerSendMode({ lastUserMessageAt: last, now: at(elapsedMs), byHuman });

describe('FR-014 messengerSendMode (cửa sổ 24 giờ / 7 ngày)', () => {
  it('23h59: tự động được, loại RESPONSE (cả AI lẫn người)', () => {
    for (const byHuman of [false, true]) {
      expect(mode(24 * HOUR - MINUTE, byHuman)).toEqual({
        allowed: true,
        messagingType: 'RESPONSE',
      });
    }
  });

  it('đúng 24h: vẫn trong cửa sổ; 24h01: chỉ người (MESSAGE_TAG + HUMAN_AGENT), AI bị từ chối', () => {
    expect(mode(24 * HOUR, false)).toMatchObject({ allowed: true, messagingType: 'RESPONSE' });
    expect(mode(24 * HOUR + MINUTE, true)).toEqual({
      allowed: true,
      messagingType: 'MESSAGE_TAG',
      tag: 'HUMAN_AGENT',
    });
    expect(mode(24 * HOUR + MINUTE, false)).toEqual({ allowed: false, reason: 'HUMAN_REQUIRED' });
  });

  it('đúng 7 ngày: người còn gửi được; 7 ngày + 1 phút: khóa với mọi người gửi', () => {
    expect(mode(168 * HOUR, true)).toMatchObject({ allowed: true, tag: 'HUMAN_AGENT' });
    for (const byHuman of [false, true]) {
      expect(mode(168 * HOUR + MINUTE, byHuman)).toEqual({
        allowed: false,
        reason: 'WINDOW_EXPIRED',
      });
    }
  });

  it('mốc ở tương lai (đồng hồ lệch) coi như vừa nhắn → RESPONSE', () => {
    expect(
      messengerSendMode({ lastUserMessageAt: at(HOUR), now: last, byHuman: false }),
    ).toMatchObject({ allowed: true, messagingType: 'RESPONSE' });
  });
});

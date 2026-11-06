import { describe, expect, it } from 'vitest';
import { messageWindowState, splitMinutes } from './message-window';

const T0 = new Date('2026-11-06T00:00:00Z');
const H = 3_600_000;
const at = (ms: number) => new Date(T0.getTime() + ms);

describe('messageWindowState (cửa sổ 24 giờ / 7 ngày, docs/12)', () => {
  it('còn > 2 giờ: cửa sổ chuẩn, trả lời tự do', () => {
    expect(messageWindowState(T0, at(10 * H))).toMatchObject({
      kind: 'open',
      remainingMinutes: 14 * 60,
      canReply: true,
      autoReplyAllowed: true,
    });
  });
  it('còn đúng 2 giờ: vẫn chuẩn; dưới 2 giờ: cảnh báo', () => {
    expect(messageWindowState(T0, at(22 * H)).kind).toBe('open');
    expect(messageWindowState(T0, at(22 * H + 60_000))).toMatchObject({
      kind: 'warning',
      remainingMinutes: 119,
    });
  });
  it('làm tròn lên số phút còn lại', () => {
    expect(messageWindowState(T0, at(23 * H + 30_000)).remainingMinutes).toBe(60);
  });
  it('hết 24 giờ: chỉ nhân viên (HUMAN_AGENT) tới hết 7 ngày, AI không tự gửi', () => {
    expect(messageWindowState(T0, at(24 * H))).toMatchObject({
      kind: 'humanAgent',
      canReply: true,
      autoReplyAllowed: false,
    });
    expect(messageWindowState(T0, at(7 * 24 * H - 1)).kind).toBe('humanAgent');
  });
  it('qua 7 ngày: khóa hẳn', () => {
    expect(messageWindowState(T0, at(7 * 24 * H))).toMatchObject({
      kind: 'locked',
      canReply: false,
      autoReplyAllowed: false,
    });
  });
  it('tin khách ở tương lai (lệch đồng hồ) coi như vừa nhắn', () => {
    expect(messageWindowState(at(H), T0)).toMatchObject({
      kind: 'open',
      remainingMinutes: 1440,
    });
  });
  it('splitMinutes tách giờ/phút', () => {
    expect(splitMinutes(105)).toEqual({ hours: 1, minutes: 45 });
  });
});

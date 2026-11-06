import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HUMAN_HOLD_MINUTES,
  evaluateHumanHold,
  MAX_HUMAN_HOLD_MINUTES,
} from './human-hold-rules';

const NOW = new Date('2026-11-06T10:00:00Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const staff = (at: Date) => ({ by: 'staff' as const, at });

describe('FR-154 người đang giữ chuỗi', () => {
  it('nhân viên trả lời 30 phút trước → đang giữ (mặc định 120 phút)', () => {
    const r = evaluateHumanHold({ now: NOW, thread: [staff(minutesAgo(30))] });
    expect(r.holding).toBe(true);
    expect(r.reason).toBe('staff_replied_recently');
    expect(r.heldUntil).toEqual(minutesAgo(30 - DEFAULT_HUMAN_HOLD_MINUTES));
  });

  it('đúng biên: 119 phút còn giữ, đúng 120 phút trở đi thì nhả', () => {
    expect(evaluateHumanHold({ now: NOW, thread: [staff(minutesAgo(119))] }).holding).toBe(true);
    expect(evaluateHumanHold({ now: NOW, thread: [staff(minutesAgo(120))] }).holding).toBe(false);
    expect(evaluateHumanHold({ now: NOW, thread: [staff(minutesAgo(500))] })).toMatchObject({
      holding: false,
      reason: 'none',
      heldUntil: null,
    });
  });

  it('chỉ nhân viên mới giữ chuỗi: AI, khách, Page khác không tính', () => {
    const thread = [
      { by: 'ai', at: minutesAgo(1) },
      { by: 'customer', at: minutesAgo(2) },
      { by: 'other', at: minutesAgo(3) },
    ];
    expect(evaluateHumanHold({ now: NOW, thread }).holding).toBe(false);
  });

  it('lấy lần trả lời gần nhất của nhân viên', () => {
    const r = evaluateHumanHold({
      now: NOW,
      thread: [staff(minutesAgo(400)), staff(minutesAgo(10))],
    });
    expect(r.holding).toBe(true);
    expect(r.heldUntil).toEqual(minutesAgo(10 - DEFAULT_HUMAN_HOLD_MINUTES));
  });

  it('Owner chỉnh số phút: 30 phút → trả lời 45 phút trước đã nhả', () => {
    const input = { now: NOW, thread: [staff(minutesAgo(45))] };
    expect(evaluateHumanHold({ ...input, holdMinutes: 30 }).holding).toBe(false);
    expect(evaluateHumanHold({ ...input, holdMinutes: 60 }).holding).toBe(true);
  });

  it('Owner đặt 0 → tắt giữ chuỗi', () => {
    const r = evaluateHumanHold({ now: NOW, thread: [staff(minutesAgo(1))], holdMinutes: 0 });
    expect(r).toMatchObject({ holding: false, reason: 'disabled' });
  });

  it.each([-5, 1.5, Number.NaN, MAX_HUMAN_HOLD_MINUTES + 1, '120', null])(
    'holdMinutes không hợp lệ (%s) → dùng mặc định, không tắt',
    (holdMinutes) => {
      const r = evaluateHumanHold({ now: NOW, thread: [staff(minutesAgo(60))], holdMinutes });
      expect(r.holding).toBe(true);
    },
  );

  it('thời điểm tương lai (lệch đồng hồ) → vẫn giữ, không mở', () => {
    const r = evaluateHumanHold({ now: NOW, thread: [staff(new Date(NOW.getTime() + 60_000))] });
    expect(r.holding).toBe(true);
  });

  it('đầu vào hỏng → giữ (thiên về chặn, không ném)', () => {
    for (const raw of [
      null,
      undefined,
      42,
      {},
      { now: 'x', thread: [] },
      { now: new Date('nope'), thread: [] },
      { now: NOW, thread: 'x' },
      { now: NOW, thread: [{ by: 'staff', at: new Date('nope') }] },
      { now: NOW, thread: [{ by: 'staff' }] },
      { now: NOW, thread: [null] },
    ]) {
      const r = evaluateHumanHold(raw);
      expect(r).toMatchObject({ holding: true, reason: 'unreadable', heldUntil: null });
    }
  });

  it('nhãn "by" lạ hoặc sai hoa/thường → hỏng → giữ', () => {
    for (const by of ['Staff', 'owner', ' staff', 'human']) {
      const r = evaluateHumanHold({ now: NOW, thread: [{ by, at: minutesAgo(1) }] });
      expect(r).toMatchObject({ holding: true, reason: 'unreadable' });
    }
  });

  it('chuỗi rất dài không ném', () => {
    const thread = Array.from({ length: 150_000 }, () => staff(minutesAgo(500)));
    expect(evaluateHumanHold({ now: NOW, thread }).holding).toBe(false);
  });

  it('tin tương lai rất xa → vẫn giữ, heldUntil null', () => {
    const r = evaluateHumanHold({ now: NOW, thread: [staff(new Date(8.64e15))] });
    expect(r).toMatchObject({ holding: true, heldUntil: null });
  });

  it('chuỗi rỗng → không giữ', () => {
    expect(evaluateHumanHold({ now: NOW, thread: [] }).holding).toBe(false);
  });
});

describe('FR-154 property-based', () => {
  const instant = fc.integer({ min: -3 * 24 * 60, max: 3 * 24 * 60 }).map(minutesAgo);
  const kind = fc.constantFrom('staff', 'ai', 'customer', 'other');
  const event = fc.record({ by: kind, at: instant });

  it('không có tin nhân viên → không bao giờ giữ', () => {
    fc.assert(
      fc.property(
        fc.array(
          event.filter((e) => e.by !== 'staff'),
          { maxLength: 20 },
        ),
        (thread) => !evaluateHumanHold({ now: NOW, thread }).holding,
      ),
    );
  });

  it('thêm một tin nhân viên vào chuỗi không bao giờ làm mất trạng thái đang giữ (đơn điệu)', () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 20 }), event, (thread, extra) => {
        const before = evaluateHumanHold({ now: NOW, thread });
        const after = evaluateHumanHold({
          now: NOW,
          thread: [...thread, { ...extra, by: 'staff' }],
        });
        return !before.holding || after.holding;
      }),
    );
  });

  it('thứ tự tin không ảnh hưởng kết quả', () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 20 }), (thread) => {
        const a = evaluateHumanHold({ now: NOW, thread });
        const b = evaluateHumanHold({ now: NOW, thread: [...thread].reverse() });
        return a.holding === b.holding && a.reason === b.reason;
      }),
    );
  });

  it('holdMinutes lớn hơn không bao giờ nhả sớm hơn (đơn điệu theo số phút)', () => {
    fc.assert(
      fc.property(
        fc.array(event, { maxLength: 10 }),
        fc.integer({ min: 1, max: MAX_HUMAN_HOLD_MINUTES }),
        fc.integer({ min: 0, max: 600 }),
        (thread, m, extra) => {
          const small = evaluateHumanHold({ now: NOW, thread, holdMinutes: m });
          const big = evaluateHumanHold({
            now: NOW,
            thread,
            holdMinutes: Math.min(m + extra, MAX_HUMAN_HOLD_MINUTES),
          });
          return !small.holding || big.holding;
        },
      ),
    );
  });

  it('không ném với đầu vào bất kỳ', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => typeof evaluateHumanHold(raw).holding === 'boolean'),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { LOCK_RENEW_MS, remainingSeconds, toLockViewState } from './comment-lock-result';

const until = new Date('2026-11-06T10:02:00Z');
const now = new Date('2026-11-06T10:00:30Z');

describe('FR-041 trạng thái khóa mềm hiển thị', () => {
  it('FR-041 acquired → "mine"; held → "held" kèm tên và số giây còn lại; not_found → "missing"', () => {
    expect(toLockViewState({ status: 'acquired', until: until.toISOString() }, now)).toEqual({
      kind: 'mine',
    });
    expect(
      toLockViewState(
        { status: 'held', holderId: 'u1', holderName: 'An', until: until.toISOString() },
        now,
      ),
    ).toEqual({ kind: 'held', holderName: 'An', secondsLeft: 90 });
    expect(toLockViewState({ status: 'not_found' }, now)).toEqual({ kind: 'missing' });
  });

  it('FR-041 người giữ không có tên → holderName null (giao diện hiện "đồng nghiệp")', () => {
    expect(
      toLockViewState(
        { status: 'held', holderId: 'u1', holderName: null, until: until.toISOString() },
        now,
      ),
    ).toMatchObject({ kind: 'held', holderName: null });
  });

  it('FR-041 remainingSeconds không âm; hạn đã qua = 0; ngày không hợp lệ = 0', () => {
    expect(remainingSeconds(until, now)).toBe(90);
    expect(remainingSeconds(new Date(now.getTime() - 5000), now)).toBe(0);
    expect(remainingSeconds(new Date('khong-hop-le'), now)).toBe(0);
  });

  it('FR-041 gia hạn nhỏ hơn TTL 120 giây (có dư để không hết hạn giữa hai lần gia hạn)', () => {
    expect(LOCK_RENEW_MS).toBeLessThan(120_000);
    expect(LOCK_RENEW_MS).toBeGreaterThan(0);
  });
});

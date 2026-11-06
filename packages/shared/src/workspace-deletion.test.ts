import { describe, expect, it } from 'vitest';
import {
  DELETION_CONFIRM_WINDOW_MINUTES,
  DELETION_GRACE_DAYS,
  type DeletionRequestInfo,
  deletionExecuteAfter,
  deletionPhase,
  matchesDeletionConfirmation,
  parseConfirmDeletion,
} from './workspace-deletion';

const NOW = new Date('2026-11-06T10:00:00Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const base: DeletionRequestInfo = {
  status: 'awaiting_confirm',
  confirmExpiresAt: minutes(5),
  executeAfter: null,
};

describe('FR-094 xác nhận xóa workspace bằng cách gõ lại mã workspace', () => {
  it('khớp đúng mã (bỏ khoảng trắng hai đầu)', () => {
    expect(matchesDeletionConfirmation('shop-abc', 'shop-abc')).toBe(true);
    expect(matchesDeletionConfirmation('shop-abc', '  shop-abc \n')).toBe(true);
  });
  it('khác chữ hoa/thường, thiếu/thừa ký tự, rỗng → không khớp', () => {
    expect(matchesDeletionConfirmation('shop-abc', 'Shop-abc')).toBe(false);
    expect(matchesDeletionConfirmation('shop-abc', 'shop-ab')).toBe(false);
    expect(matchesDeletionConfirmation('shop-abc', 'shop-abcd')).toBe(false);
    expect(matchesDeletionConfirmation('shop-abc', '')).toBe(false);
    expect(matchesDeletionConfirmation('', '')).toBe(false);
  });
});

describe('FR-094 thời gian chờ xóa', () => {
  it('thời gian chờ là 7 ngày, cửa sổ xác nhận 15 phút (Q-WSD1)', () => {
    expect(DELETION_GRACE_DAYS).toBe(7);
    expect(DELETION_CONFIRM_WINDOW_MINUTES).toBe(15);
  });
  it('deletionExecuteAfter = lúc xác nhận + 7 ngày', () => {
    expect(deletionExecuteAfter(NOW)).toEqual(days(7));
  });
});

describe('FR-094 pha của yêu cầu xóa', () => {
  it('đang chờ xác nhận bước 2 trong cửa sổ', () => {
    expect(deletionPhase(base, NOW)).toBe('awaiting_confirm');
  });
  it('chờ xác nhận nhưng quá hạn (đúng ngưỡng cũng hết hạn)', () => {
    expect(deletionPhase({ ...base, confirmExpiresAt: minutes(-1) }, NOW)).toBe('confirm_expired');
    expect(deletionPhase({ ...base, confirmExpiresAt: NOW }, NOW)).toBe('confirm_expired');
  });
  it('đã xác nhận, còn trong thời gian chờ → scheduled; đúng/quá hạn → due', () => {
    const scheduled: DeletionRequestInfo = {
      status: 'scheduled',
      confirmExpiresAt: minutes(-60),
      executeAfter: days(3),
    };
    expect(deletionPhase(scheduled, NOW)).toBe('scheduled');
    expect(deletionPhase({ ...scheduled, executeAfter: NOW }, NOW)).toBe('due');
    expect(deletionPhase({ ...scheduled, executeAfter: days(-1) }, NOW)).toBe('due');
  });
  it('scheduled thiếu executeAfter → fail-closed: không bao giờ due', () => {
    expect(
      deletionPhase({ status: 'scheduled', confirmExpiresAt: null, executeAfter: null }, NOW),
    ).toBe('scheduled');
  });
  it('trạng thái cuối giữ nguyên', () => {
    for (const status of ['cancelled', 'completed', 'expired'] as const) {
      expect(deletionPhase({ ...base, status }, NOW)).toBe(status);
    }
  });
});

describe('FR-094 kiểm đầu vào bước 2', () => {
  it('nhận id yêu cầu (uuid) + mã đã gõ', () => {
    const id = '4f7b1f0e-6f7e-4a53-9c3a-0f2a9a0b1c2d';
    expect(parseConfirmDeletion({ requestId: id, typedSlug: ' shop-a ' })).toEqual({
      requestId: id,
      typedSlug: 'shop-a',
    });
  });
  it('id không phải uuid hoặc mã rỗng/quá dài → VALIDATION', () => {
    expect(() => parseConfirmDeletion({ requestId: 'x', typedSlug: 'a' })).toThrow();
    expect(() =>
      parseConfirmDeletion({ requestId: '4f7b1f0e-6f7e-4a53-9c3a-0f2a9a0b1c2d', typedSlug: ' ' }),
    ).toThrow();
    expect(() =>
      parseConfirmDeletion({
        requestId: '4f7b1f0e-6f7e-4a53-9c3a-0f2a9a0b1c2d',
        typedSlug: 'a'.repeat(101),
      }),
    ).toThrow();
  });
});

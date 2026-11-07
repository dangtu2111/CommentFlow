import type { RateDecision, RateLimiter } from '@flow/saas-core';
import { describe, expect, it, vi } from 'vitest';
import { createActionGuard } from './action-guard';

const WHO = { userId: 'u1', workspaceId: 'w1' };

const limiterReturning = (decision: RateDecision) =>
  ({ check: vi.fn().mockResolvedValue(decision) }) as unknown as Pick<RateLimiter, 'check'> & {
    check: ReturnType<typeof vi.fn>;
  };

describe('createActionGuard', () => {
  it('được phép → true, truyền đúng nhóm + người dùng + workspace', async () => {
    const limiter = limiterReturning({ allowed: true });
    const guard = createActionGuard(limiter);
    expect(await guard('uiWrite', WHO)).toBe(true);
    expect(limiter.check).toHaveBeenCalledWith('uiWrite', WHO);
  });

  it.each(['limited', 'unavailable'] as const)('bị chặn (%s) → false', async (reason) => {
    const guard = createActionGuard(
      limiterReturning({ allowed: false, retryAfterSeconds: 5, reason }),
    );
    expect(await guard('uiSensitive', WHO)).toBe(false);
  });

  it('bộ giới hạn ném lỗi bất ngờ → vẫn cho qua? KHÔNG: lỗi lan ra để Server Action báo unavailable, không âm thầm bỏ chặn', async () => {
    const limiter = { check: vi.fn().mockRejectedValue(new Error('boom')) };
    const guard = createActionGuard(limiter as unknown as Pick<RateLimiter, 'check'>);
    await expect(guard('uiHeavy', WHO)).rejects.toThrow('boom');
  });
});

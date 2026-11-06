import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COMPLETE_WINDOW_MS, RELEASE_WAIT_MS, recoveryPhase, VERIFY_TTL_MS } from './phase';
import type { RecoveryRequest } from './types';

const base: RecoveryRequest = {
  id: 'r1',
  userId: 'u1',
  verifyHash: 'h',
  cancelHash: null,
  status: 'awaiting_email',
  createdAt: 1000,
  verifyExpiresAt: 1000 + VERIFY_TTL_MS,
  releaseAt: null,
  approvedBy: null,
  approvedAt: null,
  completedAt: null,
};
const waiting: RecoveryRequest = {
  ...base,
  status: 'waiting',
  cancelHash: 'c',
  releaseAt: 5000 + RELEASE_WAIT_MS,
};

describe('FR-001 recoveryPhase (khôi phục 2FA)', () => {
  it('chờ email: còn hạn → awaiting_email, quá hạn → expired', () => {
    expect(recoveryPhase(base, base.verifyExpiresAt)).toBe('awaiting_email');
    expect(recoveryPhase(base, base.verifyExpiresAt + 1)).toBe('expired');
  });

  it('đang chờ: trước mốc → waiting, đúng mốc → ready, quá cửa sổ hoàn tất → expired', () => {
    const release = waiting.releaseAt as number;
    expect(recoveryPhase(waiting, release - 1)).toBe('waiting');
    expect(recoveryPhase(waiting, release)).toBe('ready');
    expect(recoveryPhase(waiting, release + COMPLETE_WINDOW_MS)).toBe('ready');
    expect(recoveryPhase(waiting, release + COMPLETE_WINDOW_MS + 1)).toBe('expired');
  });

  it('được duyệt sớm → ready ngay, nhưng vẫn hết hạn theo cửa sổ tính từ lúc duyệt', () => {
    const approved = { ...waiting, approvedBy: 'admin', approvedAt: 6000 };
    expect(recoveryPhase(approved, 6000)).toBe('ready');
    expect(recoveryPhase(approved, 6000 + COMPLETE_WINDOW_MS)).toBe('ready');
    expect(recoveryPhase(approved, 6000 + COMPLETE_WINDOW_MS + 1)).toBe('expired');
  });

  it('trạng thái kết thúc giữ nguyên theo thời gian', () => {
    for (const status of ['completed', 'cancelled', 'superseded'] as const) {
      expect(recoveryPhase({ ...waiting, status }, 9e15)).toBe(status);
    }
  });

  it('property: không bao giờ ready trước releaseAt khi chưa duyệt', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: (waiting.releaseAt as number) - 1 }), (t) => {
        expect(recoveryPhase(waiting, t)).toBe('waiting');
      }),
    );
  });

  it('property: đã expired thì thời gian về sau không quay lại ready', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e12 }), fc.integer({ min: 0, max: 1e12 }), (a, d) => {
        if (recoveryPhase(waiting, a) === 'expired')
          expect(recoveryPhase(waiting, a + d)).toBe('expired');
      }),
    );
  });
});

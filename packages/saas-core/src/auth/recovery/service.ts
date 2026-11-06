import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { RateLimiter } from '../../ratelimit';
import { NEVER_MS, RELEASE_WAIT_MS, recoveryPhase, VERIFY_TTL_MS } from './phase';
import type {
  RecoveryAudit,
  RecoveryAuditEntry,
  RecoveryEffects,
  RecoveryMailer,
  RecoveryRequest,
  RecoveryStore,
  RecoveryUsers,
} from './types';

export type RequestResetResult =
  | { status: 'accepted' }
  | { status: 'rate_limited'; retryAfterSeconds: number };
export type ConfirmEmailResult = { status: 'ok' } | { status: 'invalid_token' };
export type CompleteResult =
  | { status: 'ok' }
  | { status: 'invalid_token' }
  | { status: 'not_ready'; readyAt: number }
  | { status: 'wrong_password' }
  | { status: 'rate_limited'; retryAfterSeconds: number };
export type ApproveResult = { status: 'ok' } | { status: 'forbidden' } | { status: 'not_found' };
export type CancelResult = { status: 'ok' } | { status: 'invalid_token' };

/**
 * Khôi phục 2FA khi mất điện thoại + mã dự phòng (FR-001, QRCV1):
 * yêu cầu → xác minh email → chờ (hoặc quản trị viên khác duyệt) → nhập lại mật khẩu → tắt 2FA + xóa mọi phiên.
 * Không tiết lộ tài khoản có tồn tại; token chỉ lưu băm; mọi bước ghi kiểm toán không chứa email/token/IP.
 */
export function createTwoFactorRecovery(options: {
  store: RecoveryStore;
  audit: RecoveryAudit;
  mailer: RecoveryMailer;
  users: RecoveryUsers;
  effects: RecoveryEffects;
  limiter: RateLimiter;
  /** Khóa băm token (dùng BETTER_AUTH_SECRET). */
  secret: string;
  now?: () => number;
  newToken?: () => string;
  newId?: () => string;
}) {
  const { store, audit, mailer, users, effects, limiter, secret } = options;
  const now = options.now ?? Date.now;
  const newToken = options.newToken ?? (() => randomBytes(32).toString('base64url'));
  const newId = options.newId ?? randomUUID;

  const hashToken = (token: string): string =>
    createHmac('sha256', secret).update(`2fa-recovery:${token}`).digest('hex');
  const record = (entry: Omit<RecoveryAuditEntry, 'at'>) => audit.record({ ...entry, at: now() });

  return {
    /** Bước 1. Luôn "accepted" (trừ khi vượt giới hạn) để không lộ email nào có tài khoản/2FA. */
    async requestReset(input: { email: string; ip?: string }): Promise<RequestResetResult> {
      const gate = await limiter.check('recovery', { email: input.email, ip: input.ip });
      if (!gate.allowed)
        return { status: 'rate_limited', retryAfterSeconds: gate.retryAfterSeconds };

      const user = await users.findByEmail(input.email);
      if (!user || !user.twoFactorEnabled) return { status: 'accepted' };

      const open = await store.findOpenByUser(user.id);
      // Yêu cầu đã xác minh email (đang chờ) KHÔNG bị người lạ thay/hủy bằng cách gõ lại email nạn nhân.
      if (open?.status === 'waiting') return { status: 'accepted' };
      if (open && (await store.transition(open.id, 'awaiting_email', { status: 'superseded' }))) {
        await record({ event: 'superseded', userId: user.id, requestId: open.id });
      }

      const token = newToken();
      const createdAt = now();
      const request: RecoveryRequest = {
        id: newId(),
        userId: user.id,
        verifyHash: hashToken(token),
        cancelHash: null,
        status: 'awaiting_email',
        createdAt,
        verifyExpiresAt: createdAt + VERIFY_TTL_MS,
        releaseAt: null,
        approvedBy: null,
        approvedAt: null,
        completedAt: null,
      };
      await store.insert(request);
      await record({ event: 'requested', userId: user.id, requestId: request.id });
      await mailer.sendVerify({ to: user.email, token, expiresAt: request.verifyExpiresAt });
      return { status: 'accepted' };
    },

    /** Bước 2: bấm link trong email → bắt đầu thời gian chờ, báo chủ tài khoản kèm link hủy. */
    async confirmEmail(input: { token: string }): Promise<ConfirmEmailResult> {
      const request = await store.findByVerifyHash(hashToken(input.token));
      if (!request || recoveryPhase(request, now()) !== 'awaiting_email') {
        return { status: 'invalid_token' };
      }
      const cancelToken = newToken();
      // Quản trị viên nền tảng: không tự hết hạn chờ, bắt buộc admin khác duyệt (thư báo vào cùng hộp thư không đủ tin).
      const adminTarget = await users.isPlatformAdmin(request.userId);
      const releaseAt = adminTarget ? NEVER_MS : now() + RELEASE_WAIT_MS;
      const moved = await store.transition(request.id, 'awaiting_email', {
        status: 'waiting',
        cancelHash: hashToken(cancelToken),
        releaseAt,
      });
      if (!moved) return { status: 'invalid_token' };
      await record({ event: 'email_verified', userId: request.userId, requestId: request.id });
      const user = await users.findById(request.userId);
      if (user) {
        await mailer.sendCancelNotice({
          to: user.email,
          cancelToken,
          releaseAt: adminTarget ? null : releaseAt,
        });
      }
      return { status: 'ok' };
    },

    /** Gọi khi người dùng đăng nhập 2FA thành công hoặc cài lại 2FA: yêu cầu còn mở không còn cần và không được tắt 2FA mới. */
    async cancelOpenForUser(userId: string): Promise<boolean> {
      const open = await store.findOpenByUser(userId);
      if (!open || !(await store.transition(open.id, open.status, { status: 'cancelled' }))) {
        return false;
      }
      await record({ event: 'cancelled', userId, requestId: open.id });
      return true;
    },

    /** Quản trị viên nền tảng KHÁC chủ tài khoản duyệt sớm (sau khi tự xác minh danh tính ngoài hệ thống). */
    async approve(input: { requestId: string; approverId: string }): Promise<ApproveResult> {
      if (!(await users.isPlatformAdmin(input.approverId))) return { status: 'forbidden' };
      const request = await store.findById(input.requestId);
      if (request && request.userId === input.approverId) return { status: 'forbidden' };
      if (!request || recoveryPhase(request, now()) !== 'waiting') return { status: 'not_found' };
      const moved = await store.transition(request.id, 'waiting', {
        approvedBy: input.approverId,
        approvedAt: now(),
      });
      if (!moved) return { status: 'not_found' };
      await record({
        event: 'approved',
        userId: request.userId,
        requestId: request.id,
        actorId: input.approverId,
      });
      return { status: 'ok' };
    },

    /** Chủ tài khoản thật bấm link hủy trong email báo. */
    async cancel(input: { token: string }): Promise<CancelResult> {
      const request = await store.findByCancelHash(hashToken(input.token));
      if (!request || request.status !== 'waiting') return { status: 'invalid_token' };
      if (!(await store.transition(request.id, 'waiting', { status: 'cancelled' }))) {
        return { status: 'invalid_token' };
      }
      await record({ event: 'cancelled', userId: request.userId, requestId: request.id });
      return { status: 'ok' };
    },

    /** Bước cuối: đủ hạn chờ (hoặc đã duyệt) + đúng mật khẩu → tắt 2FA và đăng xuất mọi phiên. */
    async complete(input: { token: string; password: string }): Promise<CompleteResult> {
      const request = await store.findByVerifyHash(hashToken(input.token));
      if (!request) return { status: 'invalid_token' };
      const phase = recoveryPhase(request, now());
      if (phase === 'waiting') {
        return {
          status: 'not_ready',
          readyAt: request.approvedAt ?? (request.releaseAt as number),
        };
      }
      if (phase !== 'ready') return { status: 'invalid_token' };

      const gate = await limiter.check('recoveryComplete', { userId: request.userId });
      if (!gate.allowed)
        return { status: 'rate_limited', retryAfterSeconds: gate.retryAfterSeconds };
      if (!(await effects.verifyPassword(request.userId, input.password))) {
        await record({ event: 'wrong_password', userId: request.userId, requestId: request.id });
        return { status: 'wrong_password' };
      }

      // Giữ chỗ nguyên tử TRƯỚC khi gây hiệu ứng: hai lần gọi song song chỉ một lần thắng.
      const claimed = await store.transition(request.id, 'waiting', {
        status: 'completed',
        completedAt: now(),
      });
      if (!claimed) return { status: 'invalid_token' };
      try {
        // Xóa phiên TRƯỚC, tắt 2FA SAU: lỗi giữa chừng không để lại 2FA tắt mà phiên cũ còn sống.
        await effects.revokeAllSessions(request.userId);
        await effects.disableTwoFactor(request.userId);
      } catch (error) {
        await store.transition(request.id, 'completed', { status: 'waiting', completedAt: null });
        await record({ event: 'complete_failed', userId: request.userId, requestId: request.id });
        throw error;
      }
      await limiter.reset('recoveryComplete', { userId: request.userId });
      await record({ event: 'completed', userId: request.userId, requestId: request.id });
      const user = await users.findById(request.userId);
      if (user) await mailer.sendCompleted({ to: user.email });
      return { status: 'ok' };
    },
  };
}

export type TwoFactorRecovery = ReturnType<typeof createTwoFactorRecovery>;

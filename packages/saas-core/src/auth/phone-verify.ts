import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { RateLimiter } from '../ratelimit';
import { maskPhone, normalizePhoneE164 } from './phone';

/**
 * Xác minh SĐT bằng OTP 6 số (Cài đặt › Tài khoản). Quy tắc (test ở `phone-verify.test.ts`):
 * - Mã lưu BĂM (HMAC-SHA256 có khóa, gắn người dùng + SĐT), so sánh thời gian hằng số; không bao giờ lưu/log mã thô.
 * - Hết hạn 5 phút; sai 5 lần thì mã chết; xin lại cách nhau ≥ 60 giây; giới hạn tốc độ theo (người dùng, SĐT).
 * - Chống liệt kê: không kiểm "SĐT đã có người dùng" (không UNIQUE) và mọi lỗi nhập mã trả CÙNG `invalid`.
 * - SMS qua `SmsProvider` (bản thật chưa có — chỉ MOCK); cờ `enabled` TẮT → từ chối ngay.
 */

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;
const OTP_LENGTH = 6;

export type PhoneChallenge = {
  userId: string;
  /** E.164 đã chuẩn hóa. */
  phone: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  sentAt: Date;
};

/** Kho thử thách OTP: một dòng/người dùng. Cài đặt DB ở `server/phone-challenge-store.ts` (chỉ role `cf_auth`). */
export interface PhoneChallengeStore {
  /** Thay thử thách cũ của người dùng bằng thử thách mới (attempts = 0). */
  upsert(challenge: PhoneChallenge): Promise<void>;
  find(userId: string): Promise<PhoneChallenge | null>;
  /** Tăng số lần sai và trả số mới (nguyên tử). */
  addAttempt(userId: string): Promise<number>;
  remove(userId: string): Promise<void>;
  /** Một giao dịch: ghi `users.phone` + `phone_verified_at`, xóa thử thách. */
  markVerified(userId: string, phone: string, at: Date): Promise<void>;
}

export interface SmsProvider {
  send(message: { to: string; text: string }): Promise<void>;
}

export type StartPhoneVerifyResult =
  | { status: 'sent'; maskedPhone: string; resendAfterSeconds: number; expiresInSeconds: number }
  | { status: 'cooldown'; retryAfterSeconds: number }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'invalid_phone' }
  | { status: 'send_failed' }
  | { status: 'disabled' };

export type VerifyPhoneResult =
  | { status: 'verified'; maskedPhone: string }
  | { status: 'invalid' }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'disabled' };

export function hashOtp(secret: string, userId: string, phone: string, code: string): string {
  return createHmac('sha256', secret)
    .update(`phone-otp\u0000${userId}\u0000${phone}\u0000${code}`)
    .digest('hex');
}

const safeEqualHex = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
};

const defaultCode = (): string => randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');

export function createPhoneVerifyFlows(options: {
  store: PhoneChallengeStore;
  sms: SmsProvider;
  limiter: RateLimiter;
  /** Khóa băm OTP (dùng BETTER_AUTH_SECRET). */
  secret: string;
  enabled: boolean;
  now?: () => number;
  /** Chỉ để test. */
  generateCode?: () => string;
}) {
  const { store, sms, limiter, secret, enabled } = options;
  const now = options.now ?? Date.now;
  const generateCode = options.generateCode ?? defaultCode;

  return {
    async start(input: { userId: string; phoneInput: string }): Promise<StartPhoneVerifyResult> {
      if (!enabled) return { status: 'disabled' };
      const phone = normalizePhoneE164(input.phoneInput);
      if (!phone) return { status: 'invalid_phone' };

      const existing = await store.find(input.userId);
      if (existing && existing.phone === phone) {
        const waited = (now() - existing.sentAt.getTime()) / 1000;
        if (waited < OTP_RESEND_SECONDS) {
          return { status: 'cooldown', retryAfterSeconds: Math.ceil(OTP_RESEND_SECONDS - waited) };
        }
      }
      const gate = await limiter.check('phoneOtpSend', { userId: input.userId, phone });
      if (!gate.allowed) return { status: 'rate_limited', retryAfterSeconds: gate.retryAfterSeconds };

      const code = generateCode();
      const sentAt = new Date(now());
      await store.upsert({
        userId: input.userId,
        phone,
        codeHash: hashOtp(secret, input.userId, phone, code),
        expiresAt: new Date(sentAt.getTime() + OTP_TTL_SECONDS * 1000),
        attempts: 0,
        sentAt,
      });
      try {
        await sms.send({
          to: phone,
          text: `CommentFlow: ma xac minh cua ban la ${code}. Het han sau ${OTP_TTL_SECONDS / 60} phut. Khong chia se ma nay.`,
        });
      } catch {
        // Không để lại mã mà người dùng không nhận được; lỗi nhà cung cấp không lộ chi tiết.
        await store.remove(input.userId);
        return { status: 'send_failed' };
      }
      return {
        status: 'sent',
        maskedPhone: maskPhone(phone),
        resendAfterSeconds: OTP_RESEND_SECONDS,
        expiresInSeconds: OTP_TTL_SECONDS,
      };
    },

    async verify(input: { userId: string; code: string }): Promise<VerifyPhoneResult> {
      if (!enabled) return { status: 'disabled' };
      const challenge = await store.find(input.userId);
      const gate = await limiter.check('phoneOtpVerify', {
        userId: input.userId,
        // Không có thử thách vẫn đếm theo một giá trị cố định để không lộ "có/không có mã đang chờ".
        phone: challenge?.phone ?? 'none',
      });
      if (!gate.allowed) return { status: 'rate_limited', retryAfterSeconds: gate.retryAfterSeconds };
      if (!challenge) return { status: 'invalid' };

      if (challenge.expiresAt.getTime() <= now() || challenge.attempts >= OTP_MAX_ATTEMPTS) {
        await store.remove(input.userId);
        return { status: 'invalid' };
      }
      const code = input.code.replace(/[\s-]/g, '');
      const matches =
        /^\d{6}$/.test(code) &&
        safeEqualHex(
          challenge.codeHash,
          hashOtp(secret, input.userId, challenge.phone, code),
        );
      if (!matches) {
        const attempts = await store.addAttempt(input.userId);
        if (attempts >= OTP_MAX_ATTEMPTS) await store.remove(input.userId);
        return { status: 'invalid' };
      }
      await store.markVerified(input.userId, challenge.phone, new Date(now()));
      return { status: 'verified', maskedPhone: maskPhone(challenge.phone) };
    },
  };
}

export type PhoneVerifyFlows = ReturnType<typeof createPhoneVerifyFlows>;

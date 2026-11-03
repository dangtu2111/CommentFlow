import { bucketKey, normalizeEmail, normalizeIp } from './keys';
import { createMemoryStore, type RateStore } from './store';

export type RateAction = 'login' | 'register' | 'resend' | 'forgot';

/** Danh tính của một lần thử. Không có IP (dev không tin header nào) thì xô cần IP bị BỎ QUA — không có khóa chung "unknown". */
export type RateIdentity = { email?: string; ip?: string };

type BucketPolicy = {
  bucket: string;
  /** Danh tính cần có để xô này áp dụng. */
  needs: ReadonlyArray<keyof RateIdentity>;
  max: number;
  windowSeconds: number;
};

/** Ngưỡng theo ADR 004 §1 (spec `13` §2 + xô theo email). */
export const RATE_POLICIES: Record<
  RateAction,
  { buckets: BucketPolicy[]; onStoreFailure: 'memory' | 'deny' }
> = {
  login: {
    buckets: [
      { bucket: 'ip-email', needs: ['ip', 'email'], max: 5, windowSeconds: 15 * 60 },
      // Xô riêng theo email, ngưỡng CAO hơn xô IP: đổi IP liên tục vẫn bị chặn; chỉ khóa tạm.
      { bucket: 'email', needs: ['email'], max: 10, windowSeconds: 15 * 60 },
    ],
    onStoreFailure: 'memory',
  },
  register: {
    buckets: [
      { bucket: 'ip', needs: ['ip'], max: 5, windowSeconds: 3600 },
      { bucket: 'email', needs: ['email'], max: 3, windowSeconds: 3600 },
    ],
    onStoreFailure: 'deny',
  },
  resend: {
    buckets: [{ bucket: 'email', needs: ['email'], max: 3, windowSeconds: 3600 }],
    onStoreFailure: 'deny',
  },
  forgot: {
    buckets: [{ bucket: 'email', needs: ['email'], max: 3, windowSeconds: 3600 }],
    onStoreFailure: 'deny',
  },
};

export type RateDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; reason: 'limited' | 'unavailable' };

/** Cảnh báo vận hành: KHÔNG có email/IP/khóa. */
export type RateWarning = {
  event: 'ratelimit_store_unavailable';
  action: RateAction;
  mode: 'memory' | 'deny';
};

export type RateLimiter = {
  /** Đếm một lần thử và cho biết có được phép không. */
  check(action: RateAction, identity: RateIdentity): Promise<RateDecision>;
  /** Xóa bộ đếm của danh tính (sau khi đăng nhập thành công). */
  reset(action: RateAction, identity: RateIdentity): Promise<void>;
};

export function createRateLimiter(options: {
  store: RateStore;
  /** Khóa bí mật để băm danh tính (dùng BETTER_AUTH_SECRET). */
  secret: string;
  /** Kho dự phòng khi `store` lỗi (chỉ cho hành động có `onStoreFailure = 'memory'`). */
  fallback?: RateStore;
  onWarn?: (warning: RateWarning) => void;
}): RateLimiter {
  const fallback = options.fallback ?? createMemoryStore();

  function keysFor(action: RateAction, identity: RateIdentity) {
    const email = identity.email ? normalizeEmail(identity.email) : undefined;
    const ip = normalizeIp(identity.ip);
    const values: Record<keyof RateIdentity, string | undefined> = { email, ip };
    return RATE_POLICIES[action].buckets.flatMap((policy) => {
      if (policy.needs.some((need) => values[need] === undefined)) return [];
      const identityText = policy.needs.map((need) => values[need]).join('|');
      return [
        {
          policy,
          key: bucketKey({
            action,
            bucket: policy.bucket,
            identity: identityText,
            secret: options.secret,
          }),
        },
      ];
    });
  }

  async function count(
    store: RateStore,
    buckets: ReturnType<typeof keysFor>,
  ): Promise<RateDecision> {
    let retryAfterSeconds = 0;
    for (const { policy, key } of buckets) {
      const { count: hits, ttlSeconds } = await store.hit(key, policy.windowSeconds);
      if (hits > policy.max) retryAfterSeconds = Math.max(retryAfterSeconds, ttlSeconds);
    }
    return retryAfterSeconds > 0
      ? { allowed: false, retryAfterSeconds, reason: 'limited' }
      : { allowed: true };
  }

  return {
    async check(action, identity) {
      const buckets = keysFor(action, identity);
      if (buckets.length === 0) return { allowed: true };
      try {
        return await count(options.store, buckets);
      } catch {
        const mode = RATE_POLICIES[action].onStoreFailure;
        options.onWarn?.({ event: 'ratelimit_store_unavailable', action, mode });
        if (mode === 'deny')
          return { allowed: false, retryAfterSeconds: 60, reason: 'unavailable' };
        return count(fallback, buckets);
      }
    },
    async reset(action, identity) {
      const keys = keysFor(action, identity).map((bucket) => bucket.key);
      if (keys.length === 0) return;
      await fallback.reset(keys);
      try {
        await options.store.reset(keys);
      } catch {
        options.onWarn?.({
          event: 'ratelimit_store_unavailable',
          action,
          mode: RATE_POLICIES[action].onStoreFailure,
        });
      }
    },
  };
}

import { Redis } from 'ioredis';
import { createRateLimiter, type RateLimiter, type RateWarning } from './limiter';
import type { HitResult, RateStore } from './store';

/** INCR + EXPIRE ở lần đầu trong MỘT lệnh (nguyên tử); lần bị chặn không kéo dài cửa sổ. */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

/** Phần của client mà kho cần (ioredis thật hoặc đối tượng giả trong test). */
export type RedisLike = {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
};

export function createValkeyStore(redis: RedisLike): RateStore {
  return {
    async hit(key, windowSeconds): Promise<HitResult> {
      const reply = (await redis.eval(HIT_SCRIPT, 1, key, windowSeconds)) as [number, number];
      return { count: Number(reply[0]), ttlSeconds: Math.max(1, Number(reply[1])) };
    },
    async reset(keys) {
      if (keys.length > 0) await redis.del(...keys);
    },
  };
}

/**
 * Bộ giới hạn chạy trên Valkey. Client dùng `keyPrefix` của môi trường (`dev:`, `ci:`…). Valkey sập thì lệnh LỖI NHANH
 * (thử lại 1 lần, tối đa 1,5 giây) để kích hoạt dự phòng/từ chối; client vẫn tự kết nối lại khi Valkey sống lại.
 */
export function createValkeyRateLimiter(options: {
  url: string;
  keyPrefix?: string;
  secret: string;
  onWarn?: (warning: RateWarning) => void;
}): { limiter: RateLimiter; close: () => Promise<void> } {
  const redis = new Redis(options.url, {
    keyPrefix: options.keyPrefix ?? '',
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 1500,
    // Không bao giờ bỏ cuộc: tự kết nối lại với khoảng chờ tăng dần tới 2 giây.
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });
  // Lỗi kết nối được xử lý ở từng lần gọi (dự phòng + cảnh báo); không để sự kiện 'error' làm sập tiến trình.
  redis.on('error', () => undefined);
  return {
    limiter: createRateLimiter({
      store: createValkeyStore(redis),
      secret: options.secret,
      ...(options.onWarn ? { onWarn: options.onWarn } : {}),
    }),
    close: async () => {
      redis.disconnect();
    },
  };
}

export interface HostThrottleOptions {
  /** Khoảng tối thiểu giữa hai lần gọi cùng host (mặc định 2 giây). */
  minIntervalMs?: number;
  /** Trần cho `Crawl-delay` của website (mặc định 10 giây) để website không giữ worker quá lâu. */
  maxIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface HostThrottle {
  /** Chờ đến lượt gọi `host`; `crawlDelayMs` (từ robots.txt) chỉ có tác dụng khi lớn hơn mặc định. */
  wait(host: string, crawlDelayMs?: number): Promise<void>;
}

const DEFAULT_MIN_INTERVAL_MS = 2000;
const DEFAULT_MAX_INTERVAL_MS = 10_000;

/** Giới hạn tốc độ theo host: đặt chỗ thời điểm trước khi ngủ nên các lệnh gọi đồng thời vẫn xếp hàng đúng. */
export function createHostThrottle(options: HostThrottleOptions = {}): HostThrottle {
  const minInterval = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const maxInterval = options.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const lastSlot = new Map<string, number>();

  return {
    async wait(host, crawlDelayMs) {
      const key = host.toLowerCase();
      const interval = Math.min(
        Math.max(minInterval, crawlDelayMs ?? 0),
        Math.max(minInterval, maxInterval),
      );
      const last = lastSlot.get(key);
      const current = now();
      const delay = last === undefined ? 0 : Math.max(0, last + interval - current);
      lastSlot.set(key, current + delay);
      if (delay > 0) await sleep(delay);
    },
  };
}

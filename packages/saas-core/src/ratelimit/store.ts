/** Kết quả một lần đếm: số lần trong cửa sổ hiện tại và số giây còn lại của cửa sổ. */
export type HitResult = { count: number; ttlSeconds: number };

/**
 * Kho đếm theo cửa sổ cố định. Cửa sổ bắt đầu ở lần đếm ĐẦU TIÊN và hết sau `windowSeconds`; các lần đếm sau
 * (kể cả lần bị chặn) KHÔNG kéo dài cửa sổ — nên khóa chỉ tạm thời và tự hết.
 */
export interface RateStore {
  hit(key: string, windowSeconds: number): Promise<HitResult>;
  reset(keys: string[]): Promise<void>;
}

/** Kho trong bộ nhớ tiến trình: dự phòng khi Valkey không dùng được, và dùng cho test đơn vị. */
export function createMemoryStore(now: () => number = Date.now): RateStore {
  const entries = new Map<string, { count: number; expiresAt: number }>();
  const sweep = (at: number) => {
    for (const [key, entry] of entries) if (entry.expiresAt <= at) entries.delete(key);
  };
  return {
    async hit(key, windowSeconds) {
      const at = now();
      if (entries.size > 10_000) sweep(at); // chặn phình bộ nhớ
      let entry = entries.get(key);
      if (!entry || entry.expiresAt <= at) {
        entry = { count: 0, expiresAt: at + windowSeconds * 1000 };
        entries.set(key, entry);
      }
      entry.count += 1;
      return {
        count: entry.count,
        ttlSeconds: Math.max(1, Math.ceil((entry.expiresAt - at) / 1000)),
      };
    },
    async reset(keys) {
      for (const key of keys) entries.delete(key);
    },
  };
}

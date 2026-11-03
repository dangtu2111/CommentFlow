import type { FlowDb } from '@flow/db/runtime';
import { featureFlagOverrides, featureFlags } from '@flow/db/schema/core';
import { evaluateFlag, type FlagContext, type FlagKind, type FlagRow } from './evaluate';

const DEFAULT_TTL_MS = 30_000;
const CHANNEL = 'flags_changed';

export type FlagsOptions = {
  db: FlowDb;
  /**
   * `default_on` khai báo trong mã cho từng flag: dùng khi flag chưa có trong DB hoặc khi không đọc được DB
   * (docs/09 §10 "Lỗi đọc"). saas-core không biết flag của sản phẩm, nên sản phẩm truyền vào.
   */
  defaults: Record<string, boolean>;
  ttlMs?: number;
  now?: () => number;
  /** Được gọi khi đọc DB lỗi (để ghi log; không đưa dữ liệu nhạy cảm vào). */
  onReadError?: (error: unknown) => void;
};

type Cached<T> = { value: T; loadedAt: number };

function toFlagRow(row: typeof featureFlags.$inferSelect): FlagRow {
  return {
    key: row.key,
    kind: row.kind as FlagKind,
    defaultOn: row.defaultOn,
    rolloutPercent: row.rolloutPercent,
    plans: row.plans,
  };
}

/**
 * Feature flag đọc từ Postgres, cache trong bộ nhớ 30 giây, xóa cache ngay khi nhận
 * `NOTIFY flags_changed` (trigger ở migration 0002).
 */
export function createFlags(options: FlagsOptions) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  let generation = 0; // tăng mỗi lần invalidate: loại bỏ kết quả đọc dở dang
  let flagsCache: Cached<Map<string, FlagRow>> | undefined;
  let flagsInFlight: Promise<Map<string, FlagRow>> | undefined;
  const overridesCache = new Map<string, Cached<Map<string, boolean>>>();
  const overridesInFlight = new Map<string, Promise<Map<string, boolean>>>();
  let unlisten: (() => Promise<void>) | undefined;

  const fresh = (cached: Cached<unknown> | undefined): boolean =>
    cached !== undefined && now() - cached.loadedAt < ttlMs;

  async function loadFlags(): Promise<Map<string, FlagRow>> {
    if (flagsCache && fresh(flagsCache)) return flagsCache.value;
    if (flagsInFlight) return flagsInFlight;
    const startedAt = generation;
    flagsInFlight = options.db
      .withSystem((tx) => tx.select().from(featureFlags))
      .then((rows) => {
        const map = new Map(rows.map((r) => [r.key, toFlagRow(r)]));
        if (startedAt === generation) flagsCache = { value: map, loadedAt: now() };
        return map;
      })
      .finally(() => {
        flagsInFlight = undefined;
      });
    return flagsInFlight;
  }

  async function loadOverrides(workspaceId: string): Promise<Map<string, boolean>> {
    const cached = overridesCache.get(workspaceId);
    if (cached && fresh(cached)) return cached.value;
    const pending = overridesInFlight.get(workspaceId);
    if (pending) return pending;
    const startedAt = generation;
    const promise = options.db
      .withWorkspace(workspaceId, (tx) => tx.select().from(featureFlagOverrides))
      .then((rows) => {
        const map = new Map(rows.map((r) => [r.flagKey, r.enabled]));
        if (startedAt === generation)
          overridesCache.set(workspaceId, { value: map, loadedAt: now() });
        return map;
      })
      .finally(() => {
        overridesInFlight.delete(workspaceId);
      });
    overridesInFlight.set(workspaceId, promise);
    return promise;
  }

  function invalidate(): void {
    generation++;
    flagsCache = undefined;
    flagsInFlight = undefined;
    overridesCache.clear();
    overridesInFlight.clear();
  }

  return {
    /**
     * `failClosed: true` → khi không đọc được DB trả về false (dùng cho mọi đường tự gửi);
     * mặc định dùng `default_on` khai báo trong mã.
     */
    async isEnabled(
      key: string,
      context: FlagContext = {},
      opts: { failClosed?: boolean } = {},
    ): Promise<boolean> {
      try {
        const [flags, overrides] = await Promise.all([
          loadFlags(),
          context.workspaceId ? loadOverrides(context.workspaceId) : Promise.resolve(undefined),
        ]);
        const flag = flags.get(key);
        if (!flag) return options.defaults[key] ?? false;
        return evaluateFlag({ flag, override: overrides?.get(key), context });
      } catch (error) {
        options.onReadError?.(error);
        return opts.failClosed ? false : (options.defaults[key] ?? false);
      }
    },

    invalidate,

    /** Bắt đầu nghe `flags_changed`; gọi một lần khi khởi động tiến trình. */
    async start(): Promise<void> {
      if (unlisten) return;
      unlisten = await options.db.listen(CHANNEL, invalidate, invalidate);
    },

    async stop(): Promise<void> {
      const stop = unlisten;
      unlisten = undefined;
      await stop?.();
    },
  };
}

export type Flags = ReturnType<typeof createFlags>;

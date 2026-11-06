import type { FlowDb } from '@flow/db/runtime';
import { featureFlagOverrides, featureFlags } from '@flow/db/schema/core';
import { evaluateFlag, type FlagContext, type FlagKind, type FlagRow } from './evaluate';

const DEFAULT_TTL_MS = 30_000;
const CHANNEL = 'flags_changed';
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

/**
 * Sự kiện vòng đời của kết nối LISTEN, để nơi tạo `createFlags` ghi log/cảnh báo:
 * `lost` (mất kết nối lần đầu), `reconnect_failed` (thử lại vẫn lỗi), `reconnected` (đã nối lại).
 * `attempt` = số lần lỗi liên tiếp; `delayMs` = chờ bao lâu trước lần thử kế tiếp (không có ở `reconnected`).
 */
export type FlagsListenEvent = {
  type: 'lost' | 'reconnect_failed' | 'reconnected';
  attempt: number;
  delayMs?: number;
  /** Lỗi gốc; người nhận không nên log nguyên văn vì có thể chứa thông tin kết nối. */
  error?: unknown;
};

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
  /** Được gọi khi kết nối LISTEN mất / nối lại thất bại / nối lại được (FR-117). */
  onListenEvent?: (event: FlagsListenEvent) => void;
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
  let running = false;
  let connectionId = 0; // lỗi của kết nối cũ (id lệch) bị bỏ qua
  let failures = 0; // số lần lỗi liên tiếp, về 0 khi nối lại được
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

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

  function closeQuietly(close: (() => Promise<void>) | undefined): void {
    if (close)
      void Promise.resolve()
        .then(close)
        .catch(() => undefined);
  }

  /** Kết nối hiện tại đã chết: xóa cache (có thể lỡ thông báo), hẹn nối lại lùi dần. */
  function onConnectionLost(error: unknown): void {
    if (!running) return;
    connectionId++;
    closeQuietly(unlisten);
    unlisten = undefined;
    invalidate();
    failures++;
    const delayMs = Math.min(RECONNECT_BASE_MS * 2 ** (failures - 1), RECONNECT_MAX_MS);
    options.onListenEvent?.({
      type: failures === 1 ? 'lost' : 'reconnect_failed',
      attempt: failures,
      delayMs,
      error,
    });
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, delayMs);
  }

  async function connect(): Promise<void> {
    const id = ++connectionId;
    try {
      const close = await options.db.listen(CHANNEL, invalidate, (error) => {
        if (id === connectionId) onConnectionLost(error);
      });
      if (id !== connectionId) return closeQuietly(close); // stop() hoặc đã báo lỗi trong lúc nối
      unlisten = close;
      if (failures > 0) {
        const attempt = failures;
        failures = 0;
        invalidate();
        options.onListenEvent?.({ type: 'reconnected', attempt });
      }
    } catch (error) {
      if (id === connectionId) onConnectionLost(error);
    }
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

    /**
     * Bắt đầu nghe `flags_changed`; gọi một lần khi khởi động tiến trình. Không ném khi nối lỗi:
     * tự thử lại lùi dần (1s, 2s, … tối đa 60s) và báo qua `onListenEvent`.
     */
    async start(): Promise<void> {
      if (running) return;
      running = true;
      await connect();
    },

    async stop(): Promise<void> {
      running = false;
      connectionId++;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      const stop = unlisten;
      unlisten = undefined;
      await stop?.();
    },
  };
}

export type Flags = ReturnType<typeof createFlags>;

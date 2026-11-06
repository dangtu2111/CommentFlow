/**
 * Cổng bộ đếm cửa sổ trượt cho giới hạn tốc độ gửi (FR-114). Khóa dựng bằng `sendRateKey` — LUÔN chứa
 * `workspace_id` (AGENTS.md nguyên tắc 2). Bản Redis nguyên tử (Lua) cắm vào ở `RATE-LIMIT-PAGE-WIRE`.
 */
export interface SendRateCounter {
  /** Số sự kiện của `key` trong `(now - windowMs, now]`. */
  count(key: string, windowMs: number, now: Date): Promise<number>;
  record(key: string, now: Date): Promise<void>;
}

export const SEND_RATE_SCOPES = ['page', 'page_auto', 'post_auto', 'repeat'] as const;
export type SendRateScope = (typeof SEND_RATE_SCOPES)[number];

const SAFE_PART = /^[^:\s]+$/;

/** `sys:rl:send:<workspace_id>:<phạm vi>:<id>`; thành phần rỗng/có `:`/khoảng trắng → ném (tránh đụng khóa). */
export function sendRateKey(workspaceId: string, scope: SendRateScope, id: string): string {
  if (!SAFE_PART.test(workspaceId)) throw new Error('send-rate key: workspaceId không hợp lệ');
  if (!SAFE_PART.test(id)) throw new Error('send-rate key: id không hợp lệ');
  return `sys:rl:send:${workspaceId}:${scope}:${id}`;
}

/** CHỈ cho test/mock, một tiến trình (mất khi khởi động lại). Giữ sự kiện tối đa `retainMs` (mặc định 1 giờ). */
export function createInMemorySendRateCounter(
  options: { retainMs?: number } = {},
): SendRateCounter {
  const retainMs = options.retainMs ?? 3_600_000;
  const events = new Map<string, number[]>();
  return {
    async count(key, windowMs, now) {
      const from = now.getTime() - windowMs;
      return (events.get(key) ?? []).filter((t) => t > from).length;
    },
    async record(key, now) {
      const t = now.getTime();
      const kept = (events.get(key) ?? []).filter((e) => e >= t - retainMs);
      kept.push(t);
      events.set(key, kept);
    },
  };
}

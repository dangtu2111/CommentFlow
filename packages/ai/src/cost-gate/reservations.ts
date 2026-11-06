/**
 * Sổ đặt chỗ chi phí cho các lần gọi LLM đang bay (FR-071), trong một tiến trình. Khóa theo
 * `workspaceId` (nguyên tắc #2). Giới hạn đã biết: không chia sẻ giữa nhiều tiến trình — nhiều
 * worker có thể cùng vượt nhẹ (≤ số lần bay × ước tính); lớp cứng là ngân sách LiteLLM theo
 * workspace (docs/09 §2). Bộ đếm dùng chung (Redis) → gap `COST-GATE-PERSIST`.
 */

const MICRO = 1_000_000;

export type ReservationBook = {
  /** Đặt chỗ `usd`; trả hàm nhả (gọi nhiều lần chỉ có tác dụng một lần). */
  reserve(workspaceId: string, usd: number): () => void;
  inFlightUsd(workspaceId: string): number;
  /** Chạy `fn` tuần tự theo workspace (đo → quyết định → đặt chỗ không bị xen kẽ). */
  withLock<T>(workspaceId: string, fn: () => Promise<T>): Promise<T>;
};

export function createReservationBook(): ReservationBook {
  type Ticket = { micro: number };
  const tickets = new Map<string, Set<Ticket>>();
  const tails = new Map<string, Promise<unknown>>();

  return {
    reserve(workspaceId, usd) {
      const ticket: Ticket = { micro: Math.round(usd * MICRO) };
      const set = tickets.get(workspaceId) ?? new Set<Ticket>();
      set.add(ticket);
      tickets.set(workspaceId, set);
      return () => {
        // Set.delete idempotent: nhả lần hai không đổi gì.
        set.delete(ticket);
        if (set.size === 0 && tickets.get(workspaceId) === set) tickets.delete(workspaceId);
      };
    },

    inFlightUsd(workspaceId) {
      let micro = 0;
      for (const ticket of tickets.get(workspaceId) ?? []) micro += ticket.micro;
      return micro / MICRO;
    },

    withLock(workspaceId, fn) {
      const previous = tails.get(workspaceId) ?? Promise.resolve();
      const run = previous.then(fn, fn);
      const tail = run.catch(() => undefined);
      tails.set(workspaceId, tail);
      void tail.then(() => {
        if (tails.get(workspaceId) === tail) tails.delete(workspaceId);
      });
      return run;
    },
  };
}

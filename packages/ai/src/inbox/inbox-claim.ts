/**
 * Khóa chống trùng người xử lý hội thoại (FR-047): một hội thoại chỉ một nhân viên "đang giữ" tại một thời điểm,
 * khóa có hạn (tự hết nếu người đó bỏ đi) và gia hạn khi cùng người thao tác tiếp. Khóa Redis/DB chứa `workspace_id`
 * (AGENTS.md nguyên tắc 2). Bản lưu thật (Redis `SET NX`/Lua hoặc cột DB) cắm vào ở `MSG-INBOX-WIRE`.
 */
export const CLAIM_TTL_MS = 2 * 60_000;
const MAX_CAS_ATTEMPTS = 3;

export type ClaimRecord = { holder: string; expiresAt: number };

export interface ConversationClaimStore {
  get(key: string): Promise<ClaimRecord | null>;
  /** Đặt `next` (null = xóa) nếu giá trị hiện tại đúng bằng `expected`; trả `false` nếu đã bị đổi. */
  compareAndSet(
    key: string,
    expected: ClaimRecord | null,
    next: ClaimRecord | null,
  ): Promise<boolean>;
}

const SAFE_PART = /^[^:\s]+$/;

export function claimKey(workspaceId: string, conversationId: string): string {
  if (!SAFE_PART.test(workspaceId)) throw new Error('claim key: workspaceId không hợp lệ');
  if (!SAFE_PART.test(conversationId)) throw new Error('claim key: conversationId không hợp lệ');
  return `sys:inbox:claim:${workspaceId}:${conversationId}`;
}

export type ClaimDecision =
  | { action: 'acquire' | 'renew'; next: ClaimRecord }
  | { action: 'deny'; heldBy: string };

/** Quy tắc thuần. Mốc hết hạn loại trừ: đúng `expiresAt` coi là đã hết. */
export function decideClaim(i: {
  current: ClaimRecord | null;
  actor: string;
  now: Date;
  ttlMs: number;
}): ClaimDecision {
  const next = { holder: i.actor, expiresAt: i.now.getTime() + i.ttlMs };
  const { current } = i;
  if (current === null || current.expiresAt <= i.now.getTime()) return { action: 'acquire', next };
  if (current.holder === i.actor) return { action: 'renew', next };
  return { action: 'deny', heldBy: current.holder };
}

/** CHỈ cho test/mock, một tiến trình. */
export function createInMemoryClaimStore(): ConversationClaimStore {
  const map = new Map<string, ClaimRecord>();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async compareAndSet(key, expected, next) {
      const cur = map.get(key) ?? null;
      const same =
        cur === expected ||
        (cur !== null &&
          expected !== null &&
          cur.holder === expected.holder &&
          cur.expiresAt === expected.expiresAt);
      if (!same) return false;
      if (next === null) map.delete(key);
      else map.set(key, next);
      return true;
    },
  };
}

export type ClaimResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; reason: 'held'; heldBy: string }
  | { ok: false; reason: 'store_error' | 'input_invalid' };

export type ConversationClaimService = {
  claim(workspaceId: string, conversationId: string, actor: string): Promise<ClaimResult>;
  release(
    workspaceId: string,
    conversationId: string,
    actor: string,
  ): Promise<{ released: boolean }>;
};

export function createConversationClaimService(deps: {
  store: ConversationClaimStore;
  now?: () => Date;
  ttlMs?: number;
}): ConversationClaimService {
  const now = deps.now ?? (() => new Date());
  const ttlMs = deps.ttlMs ?? CLAIM_TTL_MS;
  const { store } = deps;

  return {
    async claim(workspaceId, conversationId, actor) {
      if (actor === '') return { ok: false, reason: 'input_invalid' };
      try {
        const key = claimKey(workspaceId, conversationId);
        for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
          const current = await store.get(key);
          const d = decideClaim({ current, actor, now: now(), ttlMs });
          if (d.action === 'deny') return { ok: false, reason: 'held', heldBy: d.heldBy };
          if (await store.compareAndSet(key, current, d.next)) {
            return { ok: true, expiresAt: new Date(d.next.expiresAt) };
          }
        }
        return { ok: false, reason: 'store_error' };
      } catch {
        // Lỗi store / khóa không hợp lệ → từ chối (đóng): không để hai người cùng giữ.
        return { ok: false, reason: 'store_error' };
      }
    },
    async release(workspaceId, conversationId, actor) {
      if (actor === '') return { released: false };
      try {
        const key = claimKey(workspaceId, conversationId);
        const current = await store.get(key);
        if (current === null || current.holder !== actor) return { released: false };
        return { released: await store.compareAndSet(key, current, null) };
      } catch {
        return { released: false };
      }
    },
  };
}

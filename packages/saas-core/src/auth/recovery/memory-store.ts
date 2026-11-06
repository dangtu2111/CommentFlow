import type { RecoveryRequest, RecoveryStatus, RecoveryStore } from './types';

/** Kho trong bộ nhớ: dùng cho test/dev. Bản DB (chờ migration) cài cùng interface `RecoveryStore`. */
export function createMemoryRecoveryStore(): RecoveryStore {
  const rows = new Map<string, RecoveryRequest>();
  const find = (match: (r: RecoveryRequest) => boolean) => [...rows.values()].find(match) ?? null;
  const copy = (r: RecoveryRequest | null) => (r ? { ...r } : null);

  return {
    async insert(request) {
      rows.set(request.id, { ...request });
    },
    async findById(id) {
      return copy(rows.get(id) ?? null);
    },
    async findByVerifyHash(hash) {
      return copy(find((r) => r.verifyHash === hash));
    },
    async findByCancelHash(hash) {
      return copy(find((r) => r.cancelHash !== null && r.cancelHash === hash));
    },
    async findOpenByUser(userId) {
      const open = [...rows.values()]
        .filter(
          (r) => r.userId === userId && (r.status === 'awaiting_email' || r.status === 'waiting'),
        )
        .sort((a, b) => b.createdAt - a.createdAt);
      return copy(open[0] ?? null);
    },
    async transition(id, from: RecoveryStatus, patch) {
      const row = rows.get(id);
      if (!row || row.status !== from) return false;
      rows.set(id, { ...row, ...patch });
      return true;
    },
  };
}

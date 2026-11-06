/**
 * Nơi giữ khóa ảo đã cấp theo workspace (AI-VIRTUALKEY). Interface: bản DB (mã hóa khóa) cần migration
 * → `AI-VIRTUALKEY-DB` (làn b). Hiện chỉ có bản bộ nhớ cho test/dev.
 */

export type VirtualKeyRecord = { key: string; maxBudgetUsd: number };

export type VirtualKeyStore = {
  get(workspaceId: string): Promise<VirtualKeyRecord | null>;
  put(workspaceId: string, record: VirtualKeyRecord): Promise<void>;
};

export function createMemoryKeyStore(): VirtualKeyStore {
  const records = new Map<string, VirtualKeyRecord>();
  return {
    async get(workspaceId) {
      const found = records.get(workspaceId);
      return found ? { ...found } : null;
    },
    async put(workspaceId, record) {
      records.set(workspaceId, { ...record });
    },
  };
}

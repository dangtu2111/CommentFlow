import {
  type AutomationChange,
  type AutomationConfig,
  type AutomationSettingsStore,
  DEFAULT_AUTOMATION_CONFIG,
  parseAutomationConfig,
} from '@flow/ai';
import type { AutomationSettingsInput, AutomationSettingsRow } from '@flow/db/runtime';

/**
 * Kho cấu hình tự gửi bản DB (AUTO-CONFIG-STORE, FR-070/071, Q-ACS1): cắm vào `AutomationSettingsStore` của
 * AUTO-MATRIX-UI. Tách `read`/`write` để test không cần DB. Đọc đi qua `parseAutomationConfig` — dữ liệu hỏng/dưới
 * sàn thì báo lỗi (không âm thầm dùng), chưa lưu thì dùng mặc định an toàn (mọi ô Tắt).
 */
export type AutomationSettingsDb = {
  read: (workspaceId: string) => Promise<AutomationSettingsRow | null>;
  write: (workspaceId: string, userId: string, input: AutomationSettingsInput) => Promise<void>;
};

function toConfig(workspaceId: string, row: AutomationSettingsRow): AutomationConfig {
  const parsed = parseAutomationConfig({
    rules: row.rules,
    threshold: row.threshold,
    delaySeconds: row.delaySeconds,
    dailyCap: row.dailyCap,
    activeHours: row.activeHours,
    blockedKeywords: row.blockedKeywords,
    signature: row.signature,
  });
  if (!parsed.success) {
    throw new Error(
      `automation_settings của workspace ${workspaceId} không hợp lệ: ${parsed.error.issues
        .map((i) => i.path.join('.') || '(gốc)')
        .join(', ')}`,
    );
  }
  return parsed.data;
}

export function createDbAutomationSettingsStore(db: AutomationSettingsDb): AutomationSettingsStore {
  return {
    async get(workspaceId) {
      const row = await db.read(workspaceId);
      return row ? toConfig(workspaceId, row) : structuredClone(DEFAULT_AUTOMATION_CONFIG);
    },
    async save(workspaceId, config, userId) {
      await db.write(workspaceId, userId, config);
    },
    async lastChange(workspaceId): Promise<AutomationChange | null> {
      const row = await db.read(workspaceId);
      return row?.updatedBy ? { userId: row.updatedBy, at: row.updatedAt } : null;
    },
  };
}

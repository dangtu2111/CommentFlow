import { type AutomationConfig, DEFAULT_AUTOMATION_CONFIG } from './settings';

export type AutomationChange = { userId: string; at: Date };

/**
 * Cổng lưu cấu hình tự gửi (FR-070/071). Mọi hàm nhận `workspaceId` (từ phiên server, không từ client). `save`
 * nhận cấu hình ĐÃ qua `parseAutomationConfig`; ghi chỉ-Owner do nơi gọi (`requireAppUser({role:'owner'})`) và,
 * ở bản DB, do RLS `withActor`. Bản DB (`cf.automation_settings`, docs/10) cắm vào ở `AUTO-MATRIX-DB` (làn b).
 */
export interface AutomationSettingsStore {
  /** Chưa lưu → cấu hình mặc định (mọi ô Tắt). Luôn trả bản sao. */
  get(workspaceId: string): Promise<AutomationConfig>;
  save(workspaceId: string, config: AutomationConfig, userId: string): Promise<void>;
  lastChange(workspaceId: string): Promise<AutomationChange | null>;
}

/** Bản trong bộ nhớ: dùng cho test và cho trang cho tới khi có bảng thật (mất khi khởi động lại). */
export function createInMemoryAutomationSettingsStore(
  now: () => Date = () => new Date(),
): AutomationSettingsStore {
  const configs = new Map<string, AutomationConfig>();
  const changes = new Map<string, AutomationChange>();
  return {
    async get(workspaceId) {
      return structuredClone(configs.get(workspaceId) ?? DEFAULT_AUTOMATION_CONFIG);
    },
    async save(workspaceId, config, userId) {
      configs.set(workspaceId, structuredClone(config));
      changes.set(workspaceId, { userId, at: now() });
    },
    async lastChange(workspaceId) {
      const change = changes.get(workspaceId);
      return change ? { ...change } : null;
    },
  };
}

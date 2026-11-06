import {
  type AutomationChange,
  type AutomationConfig,
  type AutomationSettingsStore,
  createInMemoryAutomationSettingsStore,
} from '@flow/ai';
import { type InboxChannel, listInboxChannels } from '@flow/db/runtime';
import {
  type AutomationFormField,
  type FormSource,
  parseAutomationForm,
} from '../lib/automation-form';
import { getDb } from './db';

/**
 * Cài đặt tự gửi (FR-070/071). `workspaceId`/`userId` lấy từ `requireAppUser({role:'owner'})`, không từ client.
 * Danh sách kênh luôn đọc từ DB của workspace (qua `withActor`/RLS) rồi mới dùng để đọc form → kênh của
 * workspace khác không thể lọt vào cấu hình. Q-AMU1: store hiện là bản bộ nhớ (chưa có bảng `automation_settings`,
 * migration làn b); bản DB cắm vào ở `AUTO-MATRIX-DB` bằng cách đổi `store` trong `automationSettings()`.
 */
type Ctx = { workspaceId: string; userId: string };
export type AutomationView = {
  config: AutomationConfig;
  channels: InboxChannel[];
  lastChange: AutomationChange | null;
};
export type SaveAutomationResult = { ok: true } | { ok: false; field: AutomationFormField };

type Deps = {
  store: AutomationSettingsStore;
  listChannels: (ctx: Ctx) => Promise<InboxChannel[]>;
};

export function createAutomationSettingsService({ store, listChannels }: Deps) {
  return {
    async load(ctx: Ctx): Promise<AutomationView> {
      const [config, channels, lastChange] = await Promise.all([
        store.get(ctx.workspaceId),
        listChannels(ctx),
        store.lastChange(ctx.workspaceId),
      ]);
      return { config, channels, lastChange };
    },

    async save(ctx: Ctx, data: FormSource): Promise<SaveAutomationResult> {
      const channels = await listChannels(ctx);
      const parsed = parseAutomationForm(
        data,
        channels.map((channel) => channel.id),
      );
      if (!parsed.ok) return parsed;
      await store.save(ctx.workspaceId, parsed.config, ctx.userId);
      return { ok: true };
    },
  };
}

let service: ReturnType<typeof createAutomationSettingsService> | undefined;
export const automationSettings = () => {
  service ??= createAutomationSettingsService({
    store: createInMemoryAutomationSettingsStore(),
    listChannels: ({ workspaceId, userId }) =>
      getDb().withActor(workspaceId, userId, (tx) => listInboxChannels(tx, workspaceId)),
  });
  return service;
};

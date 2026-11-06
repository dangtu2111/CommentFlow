import type { AutomationChange, AutomationConfig, AutomationSettingsStore } from '@flow/ai';
import {
  getAutomationSettings,
  type InboxChannel,
  listInboxChannels,
  saveAutomationSettings,
} from '@flow/db/runtime';
import {
  type AutomationFormField,
  type FormSource,
  parseAutomationForm,
} from '../lib/automation-form';
import { createDbAutomationSettingsStore } from './automation-settings-store';
import { getDb } from './db';

/**
 * Cài đặt tự gửi (FR-070/071). `workspaceId`/`userId` lấy từ `requireAppUser({role:'owner'})`, không từ client.
 * Danh sách kênh luôn đọc từ DB của workspace (qua `withActor`/RLS) rồi mới dùng để đọc form → kênh của
 * workspace khác không thể lọt vào cấu hình. Q-ACS1: store là bản DB (`cf.automation_settings`/`automation_rules`,
 * migration 0047): đọc qua `withWorkspace`, ghi qua `withActor` nên RLS chỉ cho Owner của đúng workspace ghi.
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
    store: createDbAutomationSettingsStore({
      read: (workspaceId) =>
        getDb().withWorkspace(workspaceId, (tx) => getAutomationSettings(tx, workspaceId)),
      write: (workspaceId, userId, input) =>
        getDb().withActor(workspaceId, userId, (tx) =>
          saveAutomationSettings(tx, workspaceId, userId, input),
        ),
    }),
    listChannels: ({ workspaceId, userId }) =>
      getDb().withActor(workspaceId, userId, (tx) => listInboxChannels(tx, workspaceId)),
  });
  return service;
};

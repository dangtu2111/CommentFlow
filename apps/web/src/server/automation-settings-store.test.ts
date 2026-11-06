import { DEFAULT_AUTOMATION_CONFIG, parseAutomationConfig } from '@flow/ai';
import type { AutomationSettingsInput, AutomationSettingsRow } from '@flow/db/runtime';
import { describe, expect, it } from 'vitest';
import { createDbAutomationSettingsStore } from './automation-settings-store';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CH = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';

function fakeDb() {
  const rows = new Map<string, AutomationSettingsRow>();
  const writes: { workspaceId: string; userId: string; input: AutomationSettingsInput }[] = [];
  return {
    rows,
    writes,
    deps: {
      read: async (workspaceId: string) => rows.get(workspaceId) ?? null,
      write: async (workspaceId: string, userId: string, input: AutomationSettingsInput) => {
        writes.push({ workspaceId, userId, input });
        rows.set(workspaceId, {
          ...input,
          rules: [...input.rules],
          blockedKeywords: [...input.blockedKeywords],
          updatedBy: userId,
          updatedAt: new Date('2026-11-06T10:00:00Z'),
        });
      },
    },
  };
}

const valid = () => {
  const parsed = parseAutomationConfig({
    ...DEFAULT_AUTOMATION_CONFIG,
    rules: [{ channelId: CH, target: 'comment', label: 'price', mode: 'auto' }],
    threshold: 0.9,
    signature: '— AI',
    blockedKeywords: ['ship'],
    activeHours: { days: [1, 2], from: '08:00', to: '20:00' },
  });
  if (!parsed.success) throw new Error('cấu hình mẫu phải hợp lệ');
  return parsed.data;
};

describe('AUTO-CONFIG-STORE: kho cấu hình tự gửi bản DB', () => {
  it('chưa lưu → mặc định an toàn (mọi ô Tắt), không lastChange; luôn trả bản sao', async () => {
    const store = createDbAutomationSettingsStore(fakeDb().deps);
    const a = await store.get(WS);
    expect(a).toEqual(DEFAULT_AUTOMATION_CONFIG);
    expect(a.rules).toEqual([]);
    a.blockedKeywords.push('x');
    expect((await store.get(WS)).blockedKeywords).toEqual([]);
    expect(await store.lastChange(WS)).toBeNull();
  });

  it('save → get trả đúng cấu hình; lastChange có người + giờ; workspace khác không thấy', async () => {
    const f = fakeDb();
    const store = createDbAutomationSettingsStore(f.deps);
    const config = valid();
    await store.save(WS, config, USER);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toMatchObject({ workspaceId: WS, userId: USER });
    expect(await store.get(WS)).toEqual(config);
    expect(await store.lastChange(WS)).toEqual({
      userId: USER,
      at: new Date('2026-11-06T10:00:00Z'),
    });
    expect(await store.get(OTHER)).toEqual(DEFAULT_AUTOMATION_CONFIG);
    expect(await store.lastChange(OTHER)).toBeNull();
  });

  it('lastChange = null khi dòng do hệ thống ghi (không có người)', async () => {
    const f = fakeDb();
    const store = createDbAutomationSettingsStore(f.deps);
    await store.save(WS, valid(), USER);
    const row = f.rows.get(WS);
    if (row) f.rows.set(WS, { ...row, updatedBy: null });
    expect(await store.lastChange(WS)).toBeNull();
  });

  it('dữ liệu lưu hỏng/ngưỡng dưới sàn → báo lỗi rõ, KHÔNG âm thầm dùng giá trị hỏng', async () => {
    const f = fakeDb();
    const store = createDbAutomationSettingsStore(f.deps);
    await store.save(WS, valid(), USER);
    const row = f.rows.get(WS);
    if (row) f.rows.set(WS, { ...row, threshold: 0.5 });
    await expect(store.get(WS)).rejects.toThrow(/automation_settings/);
  });

  it('save chuyển nguyên cấu hình đã qua Zod (không thêm/bớt trường)', async () => {
    const f = fakeDb();
    const store = createDbAutomationSettingsStore(f.deps);
    const config = valid();
    await store.save(WS, config, USER);
    expect(f.writes[0]?.input).toEqual(config);
  });
});

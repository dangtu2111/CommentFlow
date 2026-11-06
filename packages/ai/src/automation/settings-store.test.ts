import { describe, expect, it } from 'vitest';
import { type AutomationConfig, DEFAULT_AUTOMATION_CONFIG } from './settings';
import { createInMemoryAutomationSettingsStore } from './settings-store';

const CH = '3f2b8c1e-5d4a-4b7e-9a10-1c2d3e4f5a6b';
const A = 'ws-a';
const B = 'ws-b';
const custom: AutomationConfig = {
  ...DEFAULT_AUTOMATION_CONFIG,
  threshold: 0.9,
  rules: [{ channelId: CH, target: 'comment', label: 'price', mode: 'auto' }],
};

describe('FR-070 kho cấu hình tự gửi (bộ nhớ)', () => {
  it('FR-070 chưa lưu → trả mặc định (mọi ô Tắt)', async () => {
    const store = createInMemoryAutomationSettingsStore();
    expect(await store.get(A)).toEqual(DEFAULT_AUTOMATION_CONFIG);
  });

  it('FR-070 lưu rồi đọc lại đúng; workspace khác không thấy', async () => {
    const store = createInMemoryAutomationSettingsStore();
    await store.save(A, custom, 'user-1');
    expect(await store.get(A)).toEqual(custom);
    expect(await store.get(B)).toEqual(DEFAULT_AUTOMATION_CONFIG);
  });

  it('FR-070 giá trị trả về là bản sao: sửa nó không đổi kho', async () => {
    const store = createInMemoryAutomationSettingsStore();
    await store.save(A, custom, 'user-1');
    const got = await store.get(A);
    got.rules.push({ channelId: CH, target: 'message', label: 'advice', mode: 'auto' });
    expect((await store.get(A)).rules).toHaveLength(1);
  });

  it('FR-070 ghi lại người sửa + thời điểm cuối', async () => {
    const at = new Date('2026-11-06T01:00:00Z');
    const store = createInMemoryAutomationSettingsStore(() => at);
    await store.save(A, custom, 'user-1');
    expect(await store.lastChange(A)).toEqual({ userId: 'user-1', at });
    expect(await store.lastChange(B)).toBeNull();
  });
});

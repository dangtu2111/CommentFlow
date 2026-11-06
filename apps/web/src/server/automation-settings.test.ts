import { createInMemoryAutomationSettingsStore, DEFAULT_AUTOMATION_CONFIG } from '@flow/ai';
import type { InboxChannel } from '@flow/db/runtime';
import { describe, expect, it } from 'vitest';
import { createAutomationSettingsService } from './automation-settings';

const CH_A = '3f2b8c1e-5d4a-4b7e-9a10-1c2d3e4f5a6b';
const CH_B = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const channel = (id: string): InboxChannel => ({
  id,
  name: `Kênh ${id.slice(0, 4)}`,
  platform: 'facebook',
});
const form = (entries: Record<string, string>) => {
  const map = new Map(Object.entries(entries));
  return {
    get: (k: string) => map.get(k) ?? null,
    getAll: (k: string) => (map.has(k) ? [map.get(k)] : []),
  };
};
const general = {
  threshold: '85',
  delaySeconds: '60',
  dailyCap: '50',
  blockedKeywords: '',
  signature: '',
};

function setup() {
  const store = createInMemoryAutomationSettingsStore();
  const byWorkspace: Record<string, InboxChannel[]> = { A: [channel(CH_A)], B: [channel(CH_B)] };
  const service = createAutomationSettingsService({
    store,
    listChannels: async ({ workspaceId }) => byWorkspace[workspaceId] ?? [],
  });
  return { store, service };
}

describe('FR-070 dịch vụ cài đặt tự gửi', () => {
  it('FR-070 load: chưa lưu → mặc định + kênh của workspace', async () => {
    const { service } = setup();
    const view = await service.load({ workspaceId: 'A', userId: 'u' });
    expect(view.config).toEqual(DEFAULT_AUTOMATION_CONFIG);
    expect(view.channels.map((c) => c.id)).toEqual([CH_A]);
    expect(view.lastChange).toBeNull();
  });

  it('FR-070 save: lưu ô của kênh thuộc workspace và ghi người sửa', async () => {
    const { service, store } = setup();
    const r = await service.save(
      { workspaceId: 'A', userId: 'owner-1' },
      form({ ...general, [`mode:${CH_A}:comment:price`]: 'auto' }),
    );
    expect(r).toEqual({ ok: true });
    expect((await store.get('A')).rules).toHaveLength(1);
    expect((await store.lastChange('A'))?.userId).toBe('owner-1');
  });

  it('FR-070 save: ô của kênh workspace khác bị bỏ (không ghi chéo workspace)', async () => {
    const { service, store } = setup();
    await service.save(
      { workspaceId: 'A', userId: 'owner-1' },
      form({ ...general, [`mode:${CH_B}:comment:price`]: 'auto' }),
    );
    expect((await store.get('A')).rules).toEqual([]);
    expect(await store.get('B')).toEqual(DEFAULT_AUTOMATION_CONFIG);
  });

  it('FR-071 save: dữ liệu sai → không lưu, trả đúng trường', async () => {
    const { service, store } = setup();
    const r = await service.save(
      { workspaceId: 'A', userId: 'u' },
      form({ ...general, threshold: '50' }),
    );
    expect(r).toEqual({ ok: false, field: 'threshold' });
    expect(await store.lastChange('A')).toBeNull();
  });
});

import type { FlowDb } from '@flow/db/runtime';
import { featureFlagOverrides, featureFlags } from '@flow/db/schema/core';
import { describe, expect, it } from 'vitest';
import { createFlags } from './flags';

const WS = '11111111-1111-4111-8111-111111111111';

type FlagData = {
  key: string;
  kind: string;
  defaultOn: boolean;
  rolloutPercent: number;
  plans: string[] | null;
};

/** DB giả: đếm số lần đọc, cho phép bắt lỗi và đổi dữ liệu giữa các lần gọi. */
function fakeDb(state: {
  flags: FlagData[];
  overrides: { flagKey: string; enabled: boolean }[];
  fail?: boolean;
}) {
  const calls = { flags: 0, overrides: 0 };
  const tx = {
    select: () => ({
      from: async (table: unknown) => {
        if (state.fail) throw new Error('mất kết nối DB');
        if (table === featureFlags) {
          calls.flags++;
          return state.flags;
        }
        if (table === featureFlagOverrides) {
          calls.overrides++;
          return state.overrides;
        }
        return [];
      },
    }),
  };
  const db = {
    withSystem: async (fn: (t: unknown) => unknown) => fn(tx),
    withWorkspace: async (_ws: string, fn: (t: unknown) => unknown) => fn(tx),
    listen: async () => async () => {},
  } as unknown as FlowDb;
  return { db, calls };
}

const flagRow = (over: Partial<FlagData> = {}): FlagData => ({
  key: 'cf.thu',
  kind: 'ops',
  defaultOn: true,
  rolloutPercent: 0,
  plans: null,
  ...over,
});

describe('createFlags — bộ nhớ đệm 30 giây', () => {
  it('đọc DB một lần rồi dùng cache trong TTL, đọc lại sau khi hết TTL', async () => {
    const state = { flags: [flagRow()], overrides: [] };
    const { db, calls } = fakeDb(state);
    let now = 1_000_000;
    const flags = createFlags({ db, defaults: {}, now: () => now });

    expect(await flags.isEnabled('cf.thu', { workspaceId: WS })).toBe(true);
    expect(await flags.isEnabled('cf.thu', { workspaceId: WS })).toBe(true);
    expect(calls.flags).toBe(1);
    expect(calls.overrides).toBe(1);

    state.flags = [flagRow({ defaultOn: false })];
    now += 29_000;
    expect(await flags.isEnabled('cf.thu', { workspaceId: WS })).toBe(true); // vẫn cache
    now += 2_000; // quá 30 giây
    expect(await flags.isEnabled('cf.thu', { workspaceId: WS })).toBe(false);
    expect(calls.flags).toBe(2);
  });

  it('invalidate() xóa cache ngay', async () => {
    const state = { flags: [flagRow()], overrides: [] };
    const { db } = fakeDb(state);
    const flags = createFlags({ db, defaults: {} });
    expect(await flags.isEnabled('cf.thu')).toBe(true);
    state.flags = [flagRow({ defaultOn: false })];
    flags.invalidate();
    expect(await flags.isEnabled('cf.thu')).toBe(false);
  });

  it('nhiều lệnh gọi đồng thời chỉ gây một lần đọc DB (chống dồn đọc)', async () => {
    const { db, calls } = fakeDb({ flags: [flagRow()], overrides: [] });
    const flags = createFlags({ db, defaults: {} });
    await Promise.all(
      Array.from({ length: 20 }, () => flags.isEnabled('cf.thu', { workspaceId: WS })),
    );
    expect(calls.flags).toBe(1);
    expect(calls.overrides).toBe(1);
  });

  it('kết quả đọc dở dang trước invalidate() không được ghi vào cache', async () => {
    const state = { flags: [flagRow()], overrides: [] };
    const { db } = fakeDb(state);
    const flags = createFlags({ db, defaults: {} });
    const pending = flags.isEnabled('cf.thu'); // bắt đầu đọc giá trị cũ (true)
    state.flags = [flagRow({ defaultOn: false })];
    flags.invalidate();
    await pending;
    expect(await flags.isEnabled('cf.thu')).toBe(false); // phải đọc lại, không dùng giá trị cũ
  });
});

describe('createFlags — override, flag chưa có, lỗi đọc', () => {
  it('override của workspace thắng default_on', async () => {
    const { db } = fakeDb({
      flags: [flagRow({ defaultOn: true })],
      overrides: [{ flagKey: 'cf.thu', enabled: false }],
    });
    const flags = createFlags({ db, defaults: {} });
    expect(await flags.isEnabled('cf.thu', { workspaceId: WS })).toBe(false);
    expect(await flags.isEnabled('cf.thu')).toBe(true); // không workspace → không có override
  });

  it('flag chưa có trong DB → dùng default khai báo trong mã (mặc định false)', async () => {
    const { db } = fakeDb({ flags: [], overrides: [] });
    const flags = createFlags({ db, defaults: { 'cf.moi': true } });
    expect(await flags.isEnabled('cf.moi')).toBe(true);
    expect(await flags.isEnabled('cf.khong-khai-bao')).toBe(false);
  });

  it('lỗi đọc DB → dùng default trong mã và báo lỗi qua onReadError', async () => {
    const errors: unknown[] = [];
    const { db } = fakeDb({ flags: [], overrides: [], fail: true });
    const flags = createFlags({
      db,
      defaults: { 'cf.on': true, 'cf.off': false },
      onReadError: (e) => errors.push(e),
    });
    expect(await flags.isEnabled('cf.on')).toBe(true);
    expect(await flags.isEnabled('cf.off')).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('failClosed: lỗi đọc → luôn tắt (đường tự gửi), kể cả khi default trong mã là bật', async () => {
    const { db } = fakeDb({ flags: [], overrides: [], fail: true });
    const flags = createFlags({ db, defaults: { 'cf.autosend': true } });
    expect(await flags.isEnabled('cf.autosend', {}, { failClosed: true })).toBe(false);
    expect(await flags.isEnabled('cf.autosend')).toBe(true);
  });

  it('lỗi đọc không bị cache: lần sau DB hồi phục thì đọc lại được', async () => {
    const state = { flags: [flagRow({ defaultOn: false })], overrides: [], fail: true };
    const { db } = fakeDb(state);
    const flags = createFlags({ db, defaults: { 'cf.thu': true } });
    expect(await flags.isEnabled('cf.thu')).toBe(true); // lỗi → default trong mã
    state.fail = false;
    expect(await flags.isEnabled('cf.thu')).toBe(false); // đọc lại thành công
  });

  it('start()/stop(): đăng ký nghe flags_changed và hủy khi dừng', async () => {
    let handler: ((p: string) => void) | undefined;
    let stopped = false;
    const state = { flags: [flagRow()], overrides: [] };
    const base = fakeDb(state);
    const db = {
      ...base.db,
      listen: async (channel: string, onNotify: (p: string) => void) => {
        expect(channel).toBe('flags_changed');
        handler = onNotify;
        return async () => {
          stopped = true;
        };
      },
    } as unknown as FlowDb;
    const flags = createFlags({ db, defaults: {} });
    await flags.start();
    expect(await flags.isEnabled('cf.thu')).toBe(true);
    state.flags = [flagRow({ defaultOn: false })];
    handler?.('feature_flags');
    expect(await flags.isEnabled('cf.thu')).toBe(false);
    await flags.stop();
    expect(stopped).toBe(true);
  });
});

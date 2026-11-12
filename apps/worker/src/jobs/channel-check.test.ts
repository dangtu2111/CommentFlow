import { type ChannelRef, PlatformError } from '@flow/connectors';
import { describe, expect, it, vi } from 'vitest';
import { type ChannelCheckStore, checkChannels } from './channel-check';

const REF = (id: string): ChannelRef => ({
  id,
  workspaceId: 'w1',
  platform: 'facebook',
  externalId: `ext-${id}`,
});

function setup(options: {
  channels: ChannelRef[];
  check?: (
    channel: ChannelRef,
  ) => Promise<{ webhookSubscribed: boolean | null; grantedPermissions?: string[] }>;
  hasConnector?: boolean;
}) {
  const saved: Array<{ id: string; result: string; mark: string | null; granted?: string[] }> = [];
  const store: ChannelCheckStore = {
    listConnected: async () => options.channels,
    save: async (channel, result, mark, granted) => {
      saved.push({ id: channel.id, result, mark, ...(granted ? { granted } : {}) });
    },
  };
  const warn = vi.fn();
  const run = () =>
    checkChannels({
      workspaceId: 'w1',
      store,
      connectorFor: () =>
        options.hasConnector === false
          ? undefined
          : { checkConnection: options.check ?? (async () => ({ webhookSubscribed: true })) },
      warn,
    });
  return { run, saved, warn };
}

describe('checkChannels', () => {
  it('token sống + webhook đã đăng ký → ok', async () => {
    const { run, saved } = setup({ channels: [REF('a')] });
    expect(await run()).toEqual({ checked: 1, ok: 1, problems: 0 });
    expect(saved).toEqual([{ id: 'a', result: 'ok', mark: null }]);
  });

  it('token sống nhưng chưa đăng ký webhook → webhook_missing, không đổi trạng thái', async () => {
    const { run, saved } = setup({
      channels: [REF('a')],
      check: async () => ({ webhookSubscribed: false }),
    });
    expect((await run()).problems).toBe(1);
    expect(saved).toEqual([{ id: 'a', result: 'webhook_missing', mark: null }]);
  });

  it('nền tảng báo TOKEN_EXPIRED → token_invalid và đánh dấu hết hạn', async () => {
    const { run, saved } = setup({
      channels: [REF('a')],
      check: async () => {
        throw new PlatformError('TOKEN_EXPIRED');
      },
    });
    await run();
    expect(saved).toEqual([{ id: 'a', result: 'token_invalid', mark: 'expired' }]);
  });

  it('thiếu quyền (PERMISSION) → token_invalid và đánh dấu bị thu hồi', async () => {
    const { run, saved } = setup({
      channels: [REF('a')],
      check: async () => {
        throw new PlatformError('PERMISSION');
      },
    });
    await run();
    expect(saved).toEqual([{ id: 'a', result: 'token_invalid', mark: 'revoked' }]);
  });

  it('lỗi khác (mạng, giới hạn tốc độ) → error, KHÔNG đánh dấu hết hạn; một kênh lỗi không dừng kênh khác', async () => {
    const check = vi
      .fn()
      .mockRejectedValueOnce(new PlatformError('RATE_LIMIT'))
      .mockResolvedValueOnce({ webhookSubscribed: true });
    const { run, saved } = setup({ channels: [REF('a'), REF('b')], check });
    expect(await run()).toEqual({ checked: 2, ok: 1, problems: 1 });
    expect(saved).toEqual([
      { id: 'a', result: 'error', mark: null },
      { id: 'b', result: 'ok', mark: null },
    ]);
  });

  it('connector tắt/không hỗ trợ → unavailable, không gọi nền tảng', async () => {
    const { run, saved } = setup({ channels: [REF('a')], hasConnector: false });
    await run();
    expect(saved).toEqual([{ id: 'a', result: 'unavailable', mark: null }]);
  });

  it('không log id kênh, id ngoài hay nội dung lỗi', async () => {
    const { run, warn } = setup({
      channels: [REF('secret-id')],
      check: async () => {
        throw new Error('boom access_token=abc');
      },
    });
    await run();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('abc');
    expect(logged).not.toContain('secret-id');
    expect(logged).not.toContain('ext-secret-id');
  });
});

describe('checkChannels — quyền đã cấp', () => {
  it('ghi quyền ĐÃ CẤP kèm kết quả khi nền tảng trả về; không trả thì không ghi (giữ giá trị cũ)', async () => {
    const withPerms = setup({
      channels: [REF('a')],
      check: async () => ({
        webhookSubscribed: true,
        grantedPermissions: ['pages_read_engagement', 'pages_manage_metadata'],
      }),
    });
    await withPerms.run();
    expect(withPerms.saved).toEqual([
      {
        id: 'a',
        result: 'ok',
        mark: null,
        granted: ['pages_read_engagement', 'pages_manage_metadata'],
      },
    ]);
    const without = setup({ channels: [REF('a')] });
    await without.run();
    expect(without.saved[0]).not.toHaveProperty('granted');
  });

  it('token hết hiệu lực → hạ trạng thái, KHÔNG ghi quyền; quyền rỗng (không còn quyền nào) vẫn được ghi để UI báo thiếu', async () => {
    const dead = setup({
      channels: [REF('a')],
      check: async () => {
        throw new PlatformError('TOKEN_EXPIRED');
      },
    });
    await dead.run();
    expect(dead.saved).toEqual([{ id: 'a', result: 'token_invalid', mark: 'expired' }]);
    const empty = setup({
      channels: [REF('a')],
      check: async () => ({ webhookSubscribed: true, grantedPermissions: [] }),
    });
    await empty.run();
    expect(empty.saved[0]?.granted).toEqual([]);
  });
});

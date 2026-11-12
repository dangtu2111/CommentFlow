import type { EncryptedToken, FacebookPageGrant } from '@flow/connectors';
import { describe, expect, it } from 'vitest';
import {
  connectFacebookPages,
  type FbConnectDeps,
  FbConnectError,
  listConnectablePages,
} from './fb-connect';

const WS = '00000000-0000-4000-8000-000000000001';
const A: FacebookPageGrant = {
  id: '100000000000001',
  name: 'Shop A',
  accessToken: 'TOKEN-A',
  tasks: ['MANAGE'],
};
const B: FacebookPageGrant = {
  id: '100000000000002',
  name: 'Shop B',
  accessToken: 'TOKEN-B',
  tasks: ['MODERATE'],
};
const C: FacebookPageGrant = {
  id: '100000000000003',
  name: 'Shop C',
  accessToken: 'TOKEN-C',
  tasks: ['ANALYZE'],
};

type Opts = {
  pages?: FacebookPageGrant[];
  active?: string[];
  limit?: number;
  /** pageId → id mà `GET /me` trả cho token của Page đó (mặc định đúng). */
  ownerOf?: Record<string, string>;
  failSubscribeFor?: string[];
  failSave?: boolean;
  /** pageId → quyền ĐÃ CẤP mà `debug_token` trả cho token Page đó (thiếu = lỗi hỏi quyền). */
  granted?: Record<string, string[]>;
  debugFails?: boolean;
};

function setup(o: Opts = {}) {
  const log: string[] = [];
  const saved: Array<{
    externalId: string;
    ciphertext: EncryptedToken;
    scopes: readonly string[];
  }> = [];
  const warnings: unknown[] = [];
  const deps: FbConnectDeps = {
    oauth: {
      listPages: async () => o.pages ?? [A, B, C],
      debugToken: async (token) => {
        if (o.debugFails) throw new Error('debug down');
        const page = [A, B, C].find((p) => p.accessToken === token);
        return {
          valid: true,
          scopes: o.granted?.[page?.id ?? ''] ?? [],
          granular: [],
          expiresAt: null,
        };
      },
      getTokenOwnerId: async (token) => {
        const page = [A, B, C].find((p) => p.accessToken === token);
        log.push(`me:${page?.id}`);
        return o.ownerOf?.[page?.id ?? ''] ?? page?.id ?? 'unknown';
      },
    },
    store: {
      listActiveExternalIds: async () => o.active ?? [],
      saveChannel: async (page, seal) => {
        if (o.failSave) throw new Error('db down');
        const channelId = `chan-${page.externalId}`;
        saved.push({
          externalId: page.externalId,
          ciphertext: seal(channelId),
          scopes: page.scopes,
        });
        log.push(`save:${page.externalId}`);
        return channelId;
      },
      markWebhookSubscribed: async (id) => void log.push(`mark:${id}`),
      clearWebhookSubscribed: async (id) => void log.push(`clear:${id}`),
    },
    encrypt: (plaintext, ctx) => {
      log.push(`encrypt:${ctx.channelId}`);
      return { ciphertext: Buffer.from(`ENC(${plaintext})`), keyVersion: 1 };
    },
    subscribeAndVerify: async (channel, token) => {
      log.push(`subscribe:${channel.externalId}:${token}`);
      if (o.failSubscribeFor?.includes(channel.externalId)) throw new Error('boom');
    },
    limit: o.limit ?? 5,
    warn: (e) => void warnings.push(e),
  };
  return { deps, log, saved, warnings };
}

const connect = (ids: string[], deps: FbConnectDeps) =>
  connectFacebookPages({ workspaceId: WS, userToken: 'USER', selectedPageIds: ids }, deps);

describe('connectFacebookPages — thứ tự và WEBHOOK-SUBSCRIBE-VERIFY', () => {
  it('đúng thứ tự: đối chiếu danh tính → lưu kênh + token mã hóa → subscribe đích danh → đặt cờ', async () => {
    const { deps, log } = setup();
    const result = await connect([A.id], deps);
    expect(result).toEqual([{ pageId: A.id, name: 'Shop A', outcome: 'connected' }]);
    expect(log).toEqual([
      `me:${A.id}`,
      `encrypt:chan-${A.id}`,
      `save:${A.id}`,
      `clear:chan-${A.id}`,
      `subscribe:${A.id}:TOKEN-A`,
      `mark:chan-${A.id}`,
    ]);
  });

  it('HỒI QUY: token của Page khác (me.id ≠ external_id) → không tạo kênh, không lưu token, không subscribe, không đặt cờ', async () => {
    const { deps, log, saved } = setup({ ownerOf: { [A.id]: B.id } });
    const result = await connect([A.id], deps);
    expect(result).toEqual([{ pageId: A.id, name: 'Shop A', outcome: 'identity_mismatch' }]);
    expect(log).toEqual([`me:${A.id}`]);
    expect(saved).toHaveLength(0);
  });

  it('một Page lệch danh tính không chặn Page hợp lệ còn lại', async () => {
    const { deps, log } = setup({ ownerOf: { [A.id]: 'other' } });
    const result = await connect([A.id, B.id], deps);
    expect(result.map((r) => r.outcome)).toEqual(['identity_mismatch', 'connected']);
    expect(log.filter((l) => l.startsWith('mark:'))).toEqual([`mark:chan-${B.id}`]);
  });

  it('subscribe lỗi → kênh + token đã lưu nhưng KHÔNG đặt cờ webhook', async () => {
    const { deps, log } = setup({ failSubscribeFor: [A.id] });
    const result = await connect([A.id], deps);
    expect(result[0]?.outcome).toBe('connected_without_webhook');
    expect(log.some((l) => l.startsWith('mark:'))).toBe(false);
    expect(log).toContain(`save:${A.id}`);
    // HỒI QUY (verifier): cờ cũ của lần kết nối trước phải được xóa TRƯỚC khi đăng ký lại.
    expect(log.indexOf(`clear:chan-${A.id}`)).toBeLessThan(
      log.indexOf(`subscribe:${A.id}:TOKEN-A`),
    );
  });

  it('lưu DB lỗi → failed, không subscribe, không đặt cờ', async () => {
    const { deps, log } = setup({ failSave: true });
    expect((await connect([A.id], deps))[0]?.outcome).toBe('failed');
    expect(log.some((l) => l.startsWith('subscribe:') || l.startsWith('mark:'))).toBe(false);
  });

  it('Page chỉ có tác vụ không đủ (không MANAGE/MODERATE) → insufficient_permission, không gọi gì', async () => {
    const { deps, log } = setup();
    expect((await connect([C.id], deps))[0]?.outcome).toBe('insufficient_permission');
    expect(log).toEqual([]);
  });

  it('token được mã hóa trước khi lưu: ciphertext ≠ bản rõ, không lọt vào cảnh báo', async () => {
    const { deps, saved, warnings } = setup({ failSubscribeFor: [A.id] });
    await connect([A.id], deps);
    expect(saved[0]?.ciphertext.ciphertext.toString()).toBe('ENC(TOKEN-A)');
    expect(JSON.stringify(warnings)).not.toContain('TOKEN-A');
  });
});

describe('connectFacebookPages — chọn Page và giới hạn gói', () => {
  it('không chọn gì / chọn Page không thuộc token của Owner → lỗi trước mọi ghi', async () => {
    const { deps, log } = setup();
    await expect(connect([], deps)).rejects.toMatchObject({ code: 'no_selection' });
    await expect(connect(['999'], deps)).rejects.toMatchObject({ code: 'page_not_available' });
    await expect(connect([A.id, '999'], deps)).rejects.toBeInstanceOf(FbConnectError);
    expect(log).toEqual([]);
  });

  it('vượt giới hạn → limit_exceeded, không gọi Meta/ghi', async () => {
    const { deps, log } = setup({ limit: 1, active: [B.id] });
    await expect(connect([A.id], deps)).rejects.toMatchObject({ code: 'limit_exceeded' });
    expect(log).toEqual([]);
  });

  it('chọn nhiều Page vượt giới hạn → từ chối cả lô', async () => {
    const { deps, log } = setup({ limit: 1 });
    await expect(connect([A.id, B.id], deps)).rejects.toMatchObject({ code: 'limit_exceeded' });
    expect(log).toEqual([]);
  });

  it('kết nối lại Page đã có KHÔNG tính thêm; đúng giới hạn vẫn được', async () => {
    const { deps } = setup({ limit: 1, active: [A.id] });
    expect((await connect([A.id], deps))[0]?.outcome).toBe('connected');
    const exact = setup({ limit: 2, active: [A.id] });
    expect((await connect([A.id, B.id], exact.deps)).map((r) => r.outcome)).toEqual([
      'connected',
      'connected',
    ]);
  });

  it('id lặp chỉ tính một lần', async () => {
    const { deps, log } = setup({ limit: 1 });
    const result = await connect([A.id, A.id], deps);
    expect(result).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('save:'))).toHaveLength(1);
  });
});

describe('listConnectablePages', () => {
  it('đánh dấu Page đã kết nối và Page đủ tác vụ', async () => {
    const { deps } = setup({ active: [A.id] });
    expect(await listConnectablePages(deps, 'USER')).toEqual([
      { id: A.id, name: 'Shop A', connected: true, usable: true },
      { id: B.id, name: 'Shop B', connected: false, usable: true },
      { id: C.id, name: 'Shop C', connected: false, usable: false },
    ]);
  });
});

describe('connectFacebookPages — lưu quyền ĐÃ CẤP (không phải quyền đã xin)', () => {
  it('lưu đúng quyền Meta báo đã cấp cho token Page đó', async () => {
    const { deps, saved } = setup({
      granted: { [A.id]: ['pages_read_engagement', 'pages_manage_metadata'] },
    });
    await connect([A.id], deps);
    expect(saved[0]?.scopes).toEqual(['pages_manage_metadata', 'pages_read_engagement']);
  });

  it('không hỏi được quyền (lỗi) → lưu danh sách RỖNG (chưa biết), vẫn kết nối bình thường, ghi cảnh báo mã lỗi', async () => {
    const { deps, saved, warnings } = setup({ debugFails: true });
    const result = await connect([A.id], deps);
    expect(result[0]?.outcome).toBe('connected');
    expect(saved[0]?.scopes).toEqual([]);
    expect(warnings).toContainEqual({
      event: 'fb_connect_permissions_unreadable',
      pageId: A.id,
      code: 'Error',
    });
  });

  it('Page lệch danh tính không bị hỏi quyền (không gọi debug_token cho token đáng ngờ)', async () => {
    const { deps, warnings } = setup({ ownerOf: { [A.id]: B.id }, debugFails: true });
    await connect([A.id], deps);
    expect(warnings).toEqual([{ event: 'fb_connect_identity_mismatch', pageId: A.id }]);
  });
});

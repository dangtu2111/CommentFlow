import { describe, expect, it } from 'vitest';
import { createSubscribeAndVerify } from './fb-subscribe';

const APP_ID = '1234567890123456';
const PAGE = '100000000000001';
const channel = { id: 'c1', workspaceId: 'w1', platform: 'facebook', externalId: PAGE } as const;

function mock(opts: { getFields?: string[]; getMissing?: boolean; postStatus?: number } = {}) {
  const calls: Array<{ method: string; path: string; body: string }> = [];
  const fn = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push({ method, path: url.pathname, body: String(init?.body ?? '') });
    if (method === 'POST') {
      return new Response(JSON.stringify({ success: true }), { status: opts.postStatus ?? 200 });
    }
    const data = opts.getMissing
      ? []
      : [{ id: APP_ID, subscribed_fields: opts.getFields ?? ['feed'] }];
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as typeof fetch;
  return { fn, calls };
}

const run = (m: ReturnType<typeof mock>) =>
  createSubscribeAndVerify({ appId: APP_ID, appSecret: 'secret-secret-secret', fetch: m.fn })(
    channel,
    'PAGE-TOKEN-XYZ',
  );

describe('createSubscribeAndVerify', () => {
  it('POST đích danh /{external_id}/subscribed_apps (feed) rồi GET xác nhận', async () => {
    const m = mock();
    await run(m);
    expect(m.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `POST /v27.0/${PAGE}/subscribed_apps`,
      `GET /v27.0/${PAGE}/subscribed_apps`,
    ]);
    expect(m.calls[0]?.body).toContain('subscribed_fields=feed');
    expect(m.calls[0]?.body).toContain('access_token=PAGE-TOKEN-XYZ');
  });

  it('đọc lại không thấy app của mình / thiếu feed → ném lỗi (không coi là đã đăng ký)', async () => {
    await expect(run(mock({ getMissing: true }))).rejects.toMatchObject({
      message: 'facebook_subscription_not_confirmed',
    });
    await expect(run(mock({ getFields: ['messages'] }))).rejects.toMatchObject({
      message: 'facebook_subscription_not_confirmed',
    });
  });

  it('POST lỗi → ném, không đọc lại; lỗi không chứa token', async () => {
    const m = mock({ postStatus: 500 });
    const error = await run(m).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).not.toBeNull();
    expect(m.calls).toHaveLength(1);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error as object))).not.toContain(
      'PAGE-TOKEN-XYZ',
    );
  });
});

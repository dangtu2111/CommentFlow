import { createSealedValueCodec, createSignedValueCodec } from '@flow/saas-core';
import { describe, expect, it } from 'vitest';
import {
  decodeOAuthSession,
  encodeOAuthSession,
  encodeOAuthState,
  FB_SESSION_COOKIE_LABEL,
  FB_STATE_COOKIE_LABEL,
  FB_STATE_TTL_SECONDS,
  isOAuthStateValid,
  newOAuthState,
} from './fb-oauth-state';

const SECRET = 'k'.repeat(32);
const WS = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';

function setup(now = () => 1_000_000) {
  const codec = createSignedValueCodec({
    secret: SECRET,
    label: FB_STATE_COOKIE_LABEL,
    ttlSeconds: FB_STATE_TTL_SECONDS,
    now,
  });
  const payload = newOAuthState({ workspaceId: WS, userId: USER });
  return { codec, payload, cookie: codec.sign(encodeOAuthState(payload)) };
}

const check = (
  codec: ReturnType<typeof setup>['codec'],
  cookie: string | undefined,
  queryState: string | null,
  who = { workspaceId: WS, userId: USER },
) => isOAuthStateValid({ queryState, cookiePayload: codec.verify(cookie), ...who });

describe('OAuth state (chống CSRF)', () => {
  it('nonce ngẫu nhiên, đủ dài, khác nhau mỗi lần', () => {
    const a = newOAuthState({ workspaceId: WS, userId: USER });
    const b = newOAuthState({ workspaceId: WS, userId: USER });
    expect(a.nonce.length).toBeGreaterThanOrEqual(32);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it('hợp lệ khi cookie ký + state khớp + đúng người/workspace', () => {
    const { codec, payload, cookie } = setup();
    expect(check(codec, cookie, payload.nonce)).toBe(true);
  });

  it('từ chối: thiếu/sai state, thiếu cookie, cookie giả, sai người, sai workspace', () => {
    const { codec, payload, cookie } = setup();
    expect(check(codec, cookie, null)).toBe(false);
    expect(check(codec, cookie, '')).toBe(false);
    expect(check(codec, cookie, `${payload.nonce}x`)).toBe(false);
    expect(check(codec, cookie, payload.nonce.slice(0, -1))).toBe(false);
    expect(check(codec, undefined, payload.nonce)).toBe(false);
    expect(check(codec, `${cookie}x`, payload.nonce)).toBe(false);
    expect(check(codec, cookie, payload.nonce, { workspaceId: WS, userId: 'other' })).toBe(false);
    expect(check(codec, cookie, payload.nonce, { workspaceId: 'other', userId: USER })).toBe(false);
  });

  it('cookie ký bằng cùng nội dung nhưng khóa/nhãn khác → từ chối', () => {
    const { codec, payload } = setup();
    const forged = createSignedValueCodec({
      secret: 'z'.repeat(32),
      label: FB_STATE_COOKIE_LABEL,
      ttlSeconds: 600,
    }).sign(encodeOAuthState(payload));
    expect(check(codec, forged, payload.nonce)).toBe(false);
  });

  it('hết hạn sau 10 phút → từ chối', () => {
    let t = 1_000_000;
    const { codec, payload, cookie } = setup(() => t);
    t += (FB_STATE_TTL_SECONDS + 1) * 1000;
    expect(check(codec, cookie, payload.nonce)).toBe(false);
  });

  it('payload sai dạng → từ chối', () => {
    const { codec } = setup();
    for (const raw of [
      'not json',
      '{}',
      JSON.stringify({ nonce: 'short', workspaceId: WS, userId: USER }),
    ])
      expect(
        isOAuthStateValid({
          queryState: 'short',
          cookiePayload: codec.verify(codec.sign(raw)),
          workspaceId: WS,
          userId: USER,
        }),
      ).toBe(false);
  });
});

describe('cookie phiên OAuth (niêm phong)', () => {
  const sealed = createSealedValueCodec({
    secret: SECRET,
    label: FB_SESSION_COOKIE_LABEL,
    ttlSeconds: 600,
  });
  const raw = encodeOAuthSession({ userToken: 'EAAtoken', workspaceId: WS, userId: USER });

  it('mở được chỉ khi đúng người + workspace', () => {
    const opened = sealed.open(sealed.seal(raw));
    expect(decodeOAuthSession(opened, { workspaceId: WS, userId: USER })?.userToken).toBe(
      'EAAtoken',
    );
    expect(decodeOAuthSession(opened, { workspaceId: WS, userId: 'other' })).toBeNull();
    expect(decodeOAuthSession(opened, { workspaceId: 'other', userId: USER })).toBeNull();
    expect(decodeOAuthSession(null, { workspaceId: WS, userId: USER })).toBeNull();
    expect(decodeOAuthSession('{"userToken":""}', { workspaceId: WS, userId: USER })).toBeNull();
  });
});

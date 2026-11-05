import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Chống giả mạo yêu cầu (CSRF) cho OAuth Facebook (docs/13 §2): `state` là nonce ngẫu nhiên gửi sang Meta, bản sao nằm
 * trong cookie KÝ (hết hạn 10 phút) cùng workspace + người dùng đã bắt đầu luồng. Callback chỉ chấp nhận khi: cookie
 * ký hợp lệ + chưa hết hạn, `state` ở URL == nonce (so sánh thời gian hằng), VÀ phiên hiện tại vẫn đúng người
 * dùng/workspace đó. Thuần (codec ký do nơi gọi truyền vào) để test bằng bảng.
 */
export const FB_STATE_COOKIE = 'cf-fb-oauth-state';
export const FB_SESSION_COOKIE_PATH = '/app/channels';
export const FB_STATE_COOKIE_LABEL = 'fb-oauth-state/v1';
export const FB_STATE_TTL_SECONDS = 10 * 60;
/** Cookie niêm phong chứa token người dùng giữa callback và bước chọn Page. */
export const FB_SESSION_COOKIE = 'cf-fb-oauth-session';
export const FB_SESSION_COOKIE_LABEL = 'fb-oauth-session/v1';

export type OAuthStatePayload = { nonce: string; workspaceId: string; userId: string };

export function newOAuthState(
  input: { workspaceId: string; userId: string },
  random: (size: number) => Buffer = randomBytes,
): OAuthStatePayload {
  return { nonce: random(24).toString('base64url'), ...input };
}

export const encodeOAuthState = (payload: OAuthStatePayload): string => JSON.stringify(payload);

export function decodeOAuthState(raw: string | null): OAuthStatePayload | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<OAuthStatePayload>;
    if (
      typeof data.nonce === 'string' &&
      data.nonce.length >= 16 &&
      typeof data.workspaceId === 'string' &&
      typeof data.userId === 'string'
    ) {
      return { nonce: data.nonce, workspaceId: data.workspaceId, userId: data.userId };
    }
  } catch {
    // rơi xuống null
  }
  return null;
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** true ⇔ callback hợp lệ. `cookiePayload` là giá trị đã qua `codec.verify` (null nếu sai chữ ký/hết hạn). */
export function isOAuthStateValid(input: {
  queryState: string | null;
  cookiePayload: string | null;
  workspaceId: string;
  userId: string;
}): boolean {
  const payload = decodeOAuthState(input.cookiePayload);
  if (!payload || !input.queryState) return false;
  return (
    sameString(payload.nonce, input.queryState) &&
    payload.workspaceId === input.workspaceId &&
    payload.userId === input.userId
  );
}

/** Nội dung cookie niêm phong sau callback: token dài hạn của người dùng gắn với đúng người dùng + workspace. */
export type OAuthSessionPayload = { userToken: string; workspaceId: string; userId: string };

export const encodeOAuthSession = (payload: OAuthSessionPayload): string => JSON.stringify(payload);

export function decodeOAuthSession(
  raw: string | null,
  expect: { workspaceId: string; userId: string },
): OAuthSessionPayload | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<OAuthSessionPayload>;
    if (
      typeof data.userToken === 'string' &&
      data.userToken.length > 0 &&
      data.workspaceId === expect.workspaceId &&
      data.userId === expect.userId
    ) {
      return { userToken: data.userToken, workspaceId: data.workspaceId, userId: data.userId };
    }
  } catch {
    // rơi xuống null
  }
  return null;
}

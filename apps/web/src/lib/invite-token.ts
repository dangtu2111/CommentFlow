/** Hằng số của cookie nhớ lời mời (không import Next/auth để tránh vòng phụ thuộc với server/auth.ts). */
export const INVITE_COOKIE = 'cf-invite';
export const INVITE_COOKIE_LABEL = 'invite-cookie/v1';
export const INVITE_COOKIE_TTL_SECONDS = 48 * 60 * 60;

/** Token mời: 32 byte ngẫu nhiên dạng base64url (43 ký tự). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

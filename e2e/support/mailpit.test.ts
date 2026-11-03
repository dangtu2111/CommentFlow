import { describe, expect, it } from 'vitest';
import { createMailpit, extractUrls, findUrl, inviteTokenFromUrl } from './mailpit';

const VERIFY_URL =
  'http://localhost:3100/api/auth/verify-email?token=abc.def&callbackURL=%2Fverify-email';
const TOKEN = 'a'.repeat(43);
const INVITE_URL = `http://localhost:3100/invite/${TOKEN}`;

const VERIFY_TEXT = [
  'Hi An,',
  '',
  'Cảm ơn bạn.',
  '',
  `Verify email: ${VERIFY_URL}`,
  '',
  '— CommentFlow AI',
].join('\n');
const INVITE_TEXT = `Hi,\n\nView invitation: ${INVITE_URL}\n\n— CommentFlow AI`;

type Reply = { ok?: boolean; status?: number; body: unknown };

function fakeFetch(routes: Record<string, Reply>) {
  const calls: string[] = [];
  const fetchImpl = async (input: string) => {
    calls.push(input);
    const hit = Object.entries(routes).find(([prefix]) => input.includes(prefix));
    const reply = hit?.[1] ?? { ok: false, status: 404, body: {} };
    return { ok: reply.ok ?? true, status: reply.status ?? 200, json: async () => reply.body };
  };
  return { fetchImpl, calls };
}

describe('extractUrls / findUrl', () => {
  it('rút liên kết hành động ra khỏi thân thư mẫu', () => {
    expect(extractUrls(VERIFY_TEXT)).toEqual([VERIFY_URL]);
    expect(findUrl(VERIFY_TEXT, /\/verify-email/)).toBe(VERIFY_URL);
  });

  it('bỏ dấu câu cuối câu và không khớp mẫu khác', () => {
    expect(extractUrls('mở http://x.test/a/b.')).toEqual(['http://x.test/a/b']);
    expect(findUrl(VERIFY_TEXT, /\/invite\//)).toBeUndefined();
  });

  it('lấy token mời từ đường dẫn /invite/<token>', () => {
    expect(inviteTokenFromUrl(INVITE_URL)).toBe(TOKEN);
    expect(inviteTokenFromUrl('http://x.test/other/abc')).toBeUndefined();
  });
});

describe('createMailpit.waitForLink', () => {
  const search = (ids: string[]) => ({ body: { messages: ids.map((ID) => ({ ID })) } });

  it('tìm đúng thư theo mẫu trong nhiều thư và gọi search với người nhận mã hóa', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/api/v1/search': search(['m2', 'm1']),
      '/api/v1/message/m2': { body: { Text: INVITE_TEXT } },
      '/api/v1/message/m1': { body: { Text: VERIFY_TEXT } },
    });
    const mailpit = createMailpit({ baseUrl: 'http://mail.test:8025/', fetchImpl, timeoutMs: 50 });
    await expect(mailpit.waitForLink('e2e-x@example.test', /\/verify-email/)).resolves.toBe(
      VERIFY_URL,
    );
    expect(calls[0]).toBe(
      'http://mail.test:8025/api/v1/search?query=to%3Ae2e-x%40example.test&limit=50',
    );
  });

  it('thử lại khi thư chưa tới rồi trả về khi có', async () => {
    let round = 0;
    const fetchImpl = async (input: string) => {
      const body = input.includes('/api/v1/search')
        ? { messages: round++ === 0 ? [] : [{ ID: 'm1' }] }
        : { Text: INVITE_TEXT };
      return { ok: true, status: 200, json: async () => body };
    };
    const mailpit = createMailpit({
      baseUrl: 'http://mail.test',
      fetchImpl,
      intervalMs: 1,
      timeoutMs: 2000,
    });
    await expect(mailpit.waitForLink('a@example.test', /\/invite\//)).resolves.toBe(INVITE_URL);
  });

  it('hết hạn thì báo rõ, không treo; nêu lỗi HTTP gần nhất', async () => {
    const { fetchImpl } = fakeFetch({ '/api/v1/search': { ok: false, status: 503, body: {} } });
    const mailpit = createMailpit({
      baseUrl: 'http://mail.test',
      fetchImpl,
      intervalMs: 1,
      timeoutMs: 20,
    });
    await expect(mailpit.waitForLink('a@example.test', /x/)).rejects.toThrow(/HTTP 503/);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createReplyLanguageAction, type ReplyLanguageDeps } from './reply-language';

const session = { workspaceId: 'w', userId: 'u' };
const CHANNEL = '0b0e6f7e-8f7a-4f55-9c1d-0d8a3c0f7e11';

function setup(update: ReplyLanguageDeps['update']) {
  const warn = vi.fn();
  const fn = vi.fn(update);
  return { action: createReplyLanguageAction({ update: fn, warn }), fn, warn };
}

describe('FR-120 đổi ngôn ngữ trả lời của kênh', () => {
  it('ghi giá trị hợp lệ', async () => {
    const { action, fn } = setup(async () => true);
    expect(await action(session, CHANNEL, 'en')).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledWith(session, CHANNEL, 'en');
  });
  it('id không phải uuid → not_found, không chạm DB', async () => {
    const { action, fn } = setup(async () => true);
    expect(await action(session, 'x', 'vi')).toEqual({ ok: false, reason: 'not_found' });
    expect(fn).not.toHaveBeenCalled();
  });
  it('giá trị lạ → invalid_language, không chạm DB', async () => {
    const { action, fn } = setup(async () => true);
    expect(await action(session, CHANNEL, 'fr')).toEqual({ ok: false, reason: 'invalid_language' });
    expect(fn).not.toHaveBeenCalled();
  });
  it('kênh ngoài workspace (0 dòng) → not_found', async () => {
    const { action } = setup(async () => false);
    expect(await action(session, CHANNEL, 'vi')).toEqual({ ok: false, reason: 'not_found' });
  });
  it('lỗi DB → unavailable, log chỉ tên lỗi', async () => {
    const { action, warn } = setup(async () => {
      throw new TypeError('chi tiết nhạy cảm');
    });
    expect(await action(session, CHANNEL, 'vi')).toEqual({ ok: false, reason: 'unavailable' });
    expect(warn).toHaveBeenCalledWith({ event: 'reply_language_failed', reason: 'TypeError' });
  });
});

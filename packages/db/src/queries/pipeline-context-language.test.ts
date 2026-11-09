import { describe, expect, it } from 'vitest';
import { resolveLanguageHints } from './pipeline-context';

describe('resolveLanguageHints — kênh cố định → lượt khách trước → mặc định workspace', () => {
  it('kênh chọn en/vi: kênh thắng, KHÔNG truyền previousLang (tránh previousLang đè kênh)', () => {
    expect(
      resolveLanguageHints({ channelLanguage: 'en', workspaceDefault: 'vi', previousLang: 'vi' }),
    ).toEqual({ replyLanguage: 'en', previousLang: null });
    expect(
      resolveLanguageHints({ channelLanguage: 'vi', workspaceDefault: 'en', previousLang: 'en' }),
    ).toEqual({ replyLanguage: 'vi', previousLang: null });
  });
  it("kênh 'auto': lượt khách trước đứng trước, mặc định workspace làm replyLanguage cuối", () => {
    expect(
      resolveLanguageHints({ channelLanguage: 'auto', workspaceDefault: 'vi', previousLang: 'en' }),
    ).toEqual({ replyLanguage: 'vi', previousLang: 'en' });
    expect(
      resolveLanguageHints({ channelLanguage: 'auto', workspaceDefault: 'en', previousLang: null }),
    ).toEqual({ replyLanguage: 'en', previousLang: null });
  });
  it('giá trị lạ/thiếu → null (không đoán)', () => {
    expect(
      resolveLanguageHints({ channelLanguage: 'auto', workspaceDefault: null, previousLang: 'fr' }),
    ).toEqual({ replyLanguage: null, previousLang: null });
  });
});

import { describe, expect, it } from 'vitest';
import type { DraftVoice } from './draft/draft-prompt';
import { checkReplyGuard, REPLY_MAX_CHARS } from './guard-reply';

const voice = (over: Partial<DraftVoice> = {}): DraftVoice => ({
  do: [],
  dont: [],
  shopPronoun: 'shop',
  customerAddress: 'ban',
  ...over,
});
const base = {
  reply: 'Dạ shop gửi bạn thông tin sản phẩm nhé.',
  lang: 'vi' as const,
  voice: voice(),
  claims: [] as {
    text: string;
    source_ids: string[];
    kind: 'fact' | 'greeting' | 'handoff' | 'question_back';
  }[],
  allowedSourceIds: new Set(['p1', 'kb1']),
};
const codes = (input: Parameters<typeof checkReplyGuard>[0]) =>
  checkReplyGuard(input).violations.map((v) => v.code);

describe('09 §4 guard câu trả lời (nguồn từng ý, ngôn ngữ, độ dài, xưng hô)', () => {
  it('câu sạch → ok; câu rỗng → ok (nơi khác lo "không có câu")', () => {
    expect(checkReplyGuard(base)).toEqual({ ok: true, violations: [] });
    expect(checkReplyGuard({ ...base, reply: '   ' }).ok).toBe(true);
  });

  it('ý fact thiếu source_ids → trượt; id lạ (không thuộc nguồn đã đưa vào prompt) → trượt', () => {
    expect(codes({ ...base, claims: [{ text: 'a', source_ids: [], kind: 'fact' }] })).toEqual([
      'claim_unsourced',
    ]);
    expect(
      codes({ ...base, claims: [{ text: 'a', source_ids: ['p1', 'ma'], kind: 'fact' }] }),
    ).toEqual(['claim_unknown_source']);
  });

  it('ý không phải fact không cần nguồn; fact có nguồn hợp lệ → ok', () => {
    const ok = checkReplyGuard({
      ...base,
      claims: [
        { text: 'a', source_ids: ['kb1'], kind: 'fact' },
        { text: 'b', source_ids: [], kind: 'greeting' },
      ],
    });
    expect(ok.ok).toBe(true);
  });

  it('quá dài → trượt; ngưỡng tùy chỉnh được', () => {
    const long = `Dạ ${'shop '.repeat(REPLY_MAX_CHARS)}`;
    expect(codes({ ...base, reply: long })).toContain('too_long');
    expect(codes({ ...base, maxChars: 10 })).toContain('too_long');
  });

  it('sai ngôn ngữ: tiếng Anh khi cần tiếng Việt, tiếng Việt khi cần tiếng Anh', () => {
    expect(
      codes({
        ...base,
        reply: 'Thank you so much for asking, we would be happy to help you today',
      }),
    ).toContain('lang_mismatch');
    expect(
      codes({ ...base, lang: 'en', reply: 'Dạ shop sẽ gửi hàng cho bạn ngay hôm nay nhé.' }),
    ).toContain('lang_mismatch');
  });

  it('không đủ căn cứ về ngôn ngữ (câu rất ngắn, không dấu) → KHÔNG kết tội', () => {
    expect(codes({ ...base, reply: 'ok shop' })).not.toContain('lang_mismatch');
  });

  it('xưng hô: khách cấu hình "bạn" mà câu gọi "anh/chị"/"quý khách" → trượt; "bán" không bị nhầm "bạn"', () => {
    expect(codes({ ...base, reply: 'Dạ shop gửi anh/chị thông tin nhé.' })).toContain(
      'address_mismatch',
    );
    expect(codes({ ...base, reply: 'Dạ shop kính gửi quý khách thông tin nhé.' })).toContain(
      'address_mismatch',
    );
    expect(codes({ ...base, reply: 'Dạ shop đang bán áo này với giá tốt nhé.' })).not.toContain(
      'address_mismatch',
    );
  });

  it('xưng hô theo từng cấu hình khách', () => {
    const say = (customerAddress: DraftVoice['customerAddress'], reply: string) =>
      codes({ ...base, voice: voice({ customerAddress }), reply });
    expect(say('anh_chi', 'Dạ shop gửi bạn thông tin nhé.')).toContain('address_mismatch');
    expect(say('anh_chi', 'Dạ shop gửi anh/chị thông tin nhé.')).toEqual([]);
    expect(say('quy_khach', 'Dạ shop gửi anh/chị thông tin nhé.')).toContain('address_mismatch');
    expect(say('quy_khach', 'Dạ shop gửi quý khách thông tin nhé.')).toEqual([]);
    expect(say('you', 'Dạ shop gửi bạn thông tin nhé.')).toContain('address_mismatch');
  });

  it('shop tự xưng khác cấu hình ("mình xin", "em sẽ"…) → trượt; đúng cấu hình/không tự xưng → ok', () => {
    expect(codes({ ...base, reply: 'Dạ mình xin gửi bạn thông tin nhé.' })).toContain(
      'pronoun_mismatch',
    );
    expect(
      codes({
        ...base,
        voice: voice({ shopPronoun: 'em' }),
        reply: 'Dạ em xin gửi bạn thông tin nhé.',
      }),
    ).toEqual([]);
    expect(
      codes({
        ...base,
        voice: voice({ shopPronoun: 'em' }),
        reply: 'Dạ shop sẽ gửi bạn thông tin nhé.',
      }),
    ).toContain('pronoun_mismatch');
    expect(
      codes({
        ...base,
        voice: voice({ shopPronoun: 'custom', shopPronounCustom: '' }),
        reply: 'Dạ em xin gửi bạn thông tin nhé.',
      }),
    ).toEqual([]);
  });

  it('tiếng Anh: không kiểm xưng hô tiếng Việt', () => {
    expect(
      codes({ ...base, lang: 'en', reply: 'Thanks, we will ship your order in two days.' }),
    ).toEqual([]);
  });
});

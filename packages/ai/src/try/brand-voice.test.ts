import { describe, expect, it } from 'vitest';
import { type BrandVoiceRow, draftVoicesFromRows } from './brand-voice';

const row = (over: Partial<BrandVoiceRow> = {}): BrandVoiceRow => ({
  lang: 'vi',
  tone: 'thân thiện, gần gũi',
  greeting: 'Dạ chào bạn',
  signOff: 'Cảm ơn bạn nhé',
  doRules: ['Báo giá đúng như niêm yết'],
  dontRules: ['Không hứa giao nhanh'],
  shopPronoun: 'shop',
  shopPronounCustom: null,
  customerAddress: 'ban',
  ...over,
});

describe('draftVoicesFromRows — brand_voice của workspace → giọng văn cho bước soạn', () => {
  it('dòng hợp lệ → giọng theo ngôn ngữ, đủ trường; null được bỏ', () => {
    const voices = draftVoicesFromRows([
      row(),
      row({ lang: 'en', customerAddress: 'you', tone: null, greeting: null, signOff: null }),
    ]);
    expect(voices.vi).toEqual({
      tone: 'thân thiện, gần gũi',
      greeting: 'Dạ chào bạn',
      signOff: 'Cảm ơn bạn nhé',
      do: ['Báo giá đúng như niêm yết'],
      dont: ['Không hứa giao nhanh'],
      shopPronoun: 'shop',
      customerAddress: 'ban',
    });
    expect(voices.en).toEqual({
      do: ['Báo giá đúng như niêm yết'],
      dont: ['Không hứa giao nhanh'],
      shopPronoun: 'shop',
      customerAddress: 'you',
    });
  });

  it('xưng hô tùy chỉnh phải có chữ; hợp lệ → mang theo shopPronounCustom', () => {
    const ok = draftVoicesFromRows([
      row({ shopPronoun: 'custom', shopPronounCustom: 'tiệm mình' }),
    ]);
    expect(ok.vi?.shopPronounCustom).toBe('tiệm mình');
    expect(
      draftVoicesFromRows([row({ shopPronoun: 'custom', shopPronounCustom: '  ' })]).vi,
    ).toBeUndefined();
  });

  it('xưng hô/cách gọi không hợp lệ cho ngôn ngữ đó → bỏ dòng (không đoán), dùng giọng mặc định ở nơi gọi', () => {
    expect(draftVoicesFromRows([row({ shopPronoun: 'lạ' })])).toEqual({});
    expect(draftVoicesFromRows([row({ customerAddress: 'you' })])).toEqual({}); // 'you' không hợp lệ cho tiếng Việt
    expect(draftVoicesFromRows([row({ lang: 'en', customerAddress: 'ban' })])).toEqual({});
  });

  it('không có dòng nào → rỗng; quy tắc dư/rỗng được lọc, tối đa 20 mục', () => {
    expect(draftVoicesFromRows([])).toEqual({});
    const many = Array.from({ length: 30 }, (_, i) => `quy tắc ${i}`);
    const v = draftVoicesFromRows([row({ doRules: ['', '  ', ...many] })]).vi;
    expect(v?.do).toHaveLength(20);
    expect(v?.do[0]).toBe('quy tắc 0');
  });
});

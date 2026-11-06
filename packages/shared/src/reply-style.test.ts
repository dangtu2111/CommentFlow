import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_ADDRESSES,
  isValidAddress,
  parseReplyLanguage,
  REPLY_LANGUAGES,
  SHOP_PRONOUNS,
} from './reply-style';

describe('FR-120 ngôn ngữ trả lời theo kênh', () => {
  it('chỉ nhận auto, vi, en', () => {
    expect(REPLY_LANGUAGES).toEqual(['auto', 'vi', 'en']);
    for (const value of REPLY_LANGUAGES) expect(parseReplyLanguage(value)).toBe(value);
  });
  it.each(['fr', '', 'AUTO', ' vi', null, undefined, 1, {}])('từ chối %j', (value) => {
    expect(parseReplyLanguage(value)).toBeNull();
  });
});

describe('FR-142 xưng hô theo ngôn ngữ', () => {
  it('tiếng Việt: mọi tổ hợp shop × khách hợp lệ (custom kèm tên)', () => {
    for (const shop of SHOP_PRONOUNS) {
      for (const customer of CUSTOMER_ADDRESSES.vi) {
        const shopCustom = shop === 'custom' ? 'Shop Hoa' : undefined;
        expect(isValidAddress('vi', { shop, customer, shopCustom })).toBe(true);
      }
    }
  });
  it('custom đòi tên không rỗng sau khi cắt khoảng trắng; tên chỉ đi kèm custom', () => {
    expect(isValidAddress('vi', { shop: 'custom', customer: 'ban' })).toBe(false);
    expect(isValidAddress('vi', { shop: 'custom', customer: 'ban', shopCustom: '   ' })).toBe(
      false,
    );
    expect(isValidAddress('vi', { shop: 'em', customer: 'ban', shopCustom: 'X' })).toBe(false);
  });
  it('tiếng Anh: khách chỉ là you; cách gọi tiếng Việt bị từ chối ở en và ngược lại', () => {
    expect(isValidAddress('en', { shop: 'shop', customer: 'you' })).toBe(true);
    expect(isValidAddress('en', { shop: 'shop', customer: 'ban' })).toBe(false);
    expect(isValidAddress('vi', { shop: 'shop', customer: 'you' })).toBe(false);
  });
  it('giá trị lạ bị từ chối', () => {
    expect(isValidAddress('vi', { shop: 'anh', customer: 'ban' } as never)).toBe(false);
    expect(isValidAddress('vi', { shop: 'em', customer: 'chi' } as never)).toBe(false);
  });
});

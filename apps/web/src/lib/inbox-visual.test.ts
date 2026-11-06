import { describe, expect, it } from 'vitest';
import { INBOX_TAB_KEYS } from './inbox-filters';
import { avatarInitial, inboxTabGroup, labelTone, platformBadgeText } from './inbox-visual';

describe('avatarInitial', () => {
  it('lấy chữ cái đầu in hoa, bỏ tiền tố [MẪU], rỗng → ?', () => {
    expect(avatarInitial('[MẪU] đặng Tú')).toBe('Đ');
    expect(avatarInitial('  hoàng')).toBe('H');
    expect(avatarInitial('')).toBe('?');
  });
});

describe('platformBadgeText', () => {
  it('rút gọn nền tảng đã biết', () => {
    expect(platformBadgeText('facebook')).toBe('FB');
    expect(platformBadgeText('instagram')).toBe('IG');
    expect(platformBadgeText('tiktok')).toBe('TT');
  });
  it('nền tảng lạ → hai chữ đầu viết hoa, rỗng → "?"', () => {
    expect(platformBadgeText('zalo')).toBe('ZA');
    expect(platformBadgeText('')).toBe('?');
  });
});

describe('labelTone', () => {
  it('nhãn chuẩn có tông riêng', () => {
    expect(labelTone('price')).toBe('price');
    expect(labelTone('purchase')).toBe('purchase');
    expect(labelTone('complaint')).toBe('complaint');
    expect(labelTone('spam')).toBe('spam');
    expect(labelTone('advice')).toBe('advice');
  });
  it('nhãn lạ/null/other → trung tính', () => {
    expect(labelTone('khac')).toBe('neutral');
    expect(labelTone(null)).toBe('neutral');
    expect(labelTone('other')).toBe('neutral');
  });
});

describe('inboxTabGroup', () => {
  it('mỗi tab thuộc đúng một nhóm: đang xử lý hoặc đã xong', () => {
    for (const tab of INBOX_TAB_KEYS) expect(['active', 'done']).toContain(inboxTabGroup(tab));
    expect(inboxTabGroup('pending_review')).toBe('active');
    expect(inboxTabGroup('replied')).toBe('done');
    expect(inboxTabGroup('all')).toBe('done');
  });
});

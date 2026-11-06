import { describe, expect, it } from 'vitest';
import { ruleFilter } from './rule-filter';

const SKIP = (reason: string) => ({ skip: true, reason });
const PROCESS = { skip: false, reason: null };

describe('FR-024 ruleFilter — bỏ qua bình luận không có nội dung', () => {
  it.each(['😀', '👍🏻👍🏿', '👨‍👩‍👧', '🇻🇳', '❤️ ❤️', '😍😍😍!!!'])(
    'emoji %s → skip emoji',
    (text) => {
      expect(ruleFilter({ text })).toEqual(SKIP('emoji'));
    },
  );

  it.each(['.', '...', '…', ' . . ', '-', ',,', '!!!', '。'])(
    'dấu chấm/câu %j → skip punctuation',
    (text) => {
      expect(ruleFilter({ text })).toEqual(SKIP('punctuation'));
    },
  );

  it.each([null, undefined, '', '   \n\t'])('rỗng %j không tệp → skip empty', (text) => {
    expect(ruleFilter({ text })).toEqual(SKIP('empty'));
  });

  it('tag @Tên, nhiều tag, mẫu @[id:0:Tên] → skip mention', () => {
    expect(ruleFilter({ text: '@Shop' })).toEqual(SKIP('mention'));
    expect(ruleFilter({ text: '@an @binh.nguyen 😀' })).toEqual(SKIP('mention'));
    expect(ruleFilter({ text: '@[100001:0:Nguyễn An]' })).toEqual(SKIP('mention'));
  });

  it('tag theo mentions (offset/length) gồm tên nhiều chữ', () => {
    const text = 'Nguyễn Văn An';
    expect(ruleFilter({ text, mentions: [{ offset: 0, length: text.length }] })).toEqual(
      SKIP('mention'),
    );
  });

  it('mentions sai (âm, quá dài, số lẻ, NaN) bị bỏ qua, không ném; chồng nhau chỉ nhận mục đầu', () => {
    const bad = [
      { offset: -1, length: 3 },
      { offset: 0, length: 0 },
      { offset: 50, length: 3 },
      { offset: 1.5, length: 2 },
      { offset: Number.NaN, length: 2 },
    ];
    expect(ruleFilter({ text: 'giá bao nhiêu', mentions: bad })).toEqual(PROCESS);
    const overlap = [
      { offset: 0, length: 2 },
      { offset: 1, length: 4 },
    ];
    expect(ruleFilter({ text: 'An hỏi giá', mentions: overlap })).toEqual(PROCESS);
  });

  it('mentions quá nhiều không làm chậm/ném (chỉ xét 50 mục đầu)', () => {
    const mentions = Array.from({ length: 500 }, (_, i) => ({ offset: i, length: 1 }));
    expect(ruleFilter({ text: 'x'.repeat(500), mentions }).skip).toBe(false);
  });

  it('email không phải tag → vẫn xử lý', () => {
    expect(ruleFilter({ text: 'a@b.com' })).toEqual(PROCESS);
  });

  it('sticker/gif không chữ → skip sticker; kèm emoji vẫn sticker', () => {
    expect(ruleFilter({ text: '', attachments: [{ type: 'sticker' }] })).toEqual(SKIP('sticker'));
    expect(ruleFilter({ text: '😀', attachments: [{ type: 'gif' }, { type: 'sticker' }] })).toEqual(
      SKIP('sticker'),
    );
  });

  it('sticker kèm chữ → không bỏ qua', () => {
    expect(ruleFilter({ text: 'giá?', attachments: [{ type: 'sticker' }] })).toEqual(PROCESS);
  });

  it('ảnh/video/loại lạ đính kèm → KHÔNG bỏ qua dù không có chữ', () => {
    expect(ruleFilter({ text: '', attachments: [{ type: 'photo' }] })).toEqual(PROCESS);
    expect(
      ruleFilter({ text: '😀', attachments: [{ type: 'sticker' }, { type: 'video' }] }),
    ).toEqual(PROCESS);
    expect(ruleFilter({ text: '', attachments: [{ type: 'lạ' }] })).toEqual(PROCESS);
  });

  it.each([
    'giá?',
    'ib',
    '1',
    '10',
    '+',
    '+1',
    '$',
    '?',
    '??',
    '😀 giá',
    '1️⃣',
    '@Shop giá bao nhiêu',
    'ok.',
  ])('%j có nội dung/ký hiệu mơ hồ → KHÔNG bỏ qua', (text) => {
    expect(ruleFilter({ text })).toEqual(PROCESS);
  });

  it('mọi chữ cái (kể cả có dấu) ghép emoji/dấu chấm/tag không bao giờ bị bỏ qua', () => {
    for (const ch of 'abcxyzáàảãạâấầăắđéêếôốơớưứýỹ') {
      for (const wrap of ['😀', '...', '@x ', '']) {
        expect(ruleFilter({ text: `${wrap}${ch}${wrap}` }).skip).toBe(false);
      }
    }
  });
});

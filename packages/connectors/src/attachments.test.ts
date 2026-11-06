import { describe, expect, it } from 'vitest';
import {
  facebookGraphAttachment,
  MAX_ATTACHMENT_URL_LENGTH,
  MAX_ATTACHMENTS,
  normalizeAttachments,
  webhookAttachments,
} from './attachments';

const IMG = 'https://scontent.example.invalid/a.jpg';

describe('FR-143 normalizeAttachments — làm sạch + giới hạn', () => {
  it('giữ loại + https url + external_id hợp lệ', () => {
    expect(normalizeAttachments([{ type: 'photo', url: IMG, externalId: 'x1' }])).toEqual([
      { type: 'photo', url: IMG, externalId: 'x1' },
    ]);
  });
  it('bỏ url không phải https / quá dài nhưng vẫn giữ loại', () => {
    const long = `https://e.invalid/${'a'.repeat(MAX_ATTACHMENT_URL_LENGTH)}`;
    expect(
      normalizeAttachments([
        { type: 'photo', url: 'http://e.invalid/a.jpg' },
        { type: 'video', url: 'javascript:alert(1)' },
        { type: 'gif', url: long },
      ]),
    ).toEqual([{ type: 'photo' }, { type: 'video' }, { type: 'gif' }]);
  });
  it('loại trùng (cùng loại + url + id) và rỗng → []', () => {
    expect(normalizeAttachments([])).toEqual([]);
    expect(
      normalizeAttachments([
        { type: 'photo', url: IMG },
        { type: 'photo', url: IMG },
      ]),
    ).toEqual([{ type: 'photo', url: IMG }]);
  });
  it('tối đa MAX_ATTACHMENTS (biên 10/11)', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ type: 'photo' as const, url: `${IMG}?i=${i}` }));
    expect(MAX_ATTACHMENTS).toBe(10);
    expect(normalizeAttachments(many(10))).toHaveLength(10);
    expect(normalizeAttachments(many(11))).toHaveLength(10);
  });
  it('làm sạch NUL/surrogate lẻ trong external_id', () => {
    expect(normalizeAttachments([{ type: 'photo', externalId: 'a\u0000b\uD800' }])).toEqual([
      { type: 'photo', externalId: 'ab�' },
    ]);
  });
  it('external_id rỗng/quá dài bị bỏ', () => {
    expect(
      normalizeAttachments([
        { type: 'photo', externalId: '' },
        { type: 'sticker', externalId: 'z'.repeat(300) },
      ]),
    ).toEqual([{ type: 'photo' }, { type: 'sticker' }]);
  });
});

describe('FR-143 webhookAttachments — trường photo/video của feed', () => {
  it('photo + video thành hai tệp; thiếu → []', () => {
    expect(webhookAttachments({ photo: IMG, video: 'https://v.invalid/v.mp4' })).toEqual([
      { type: 'photo', url: IMG },
      { type: 'video', url: 'https://v.invalid/v.mp4' },
    ]);
    expect(webhookAttachments({})).toEqual([]);
  });
});

describe('FR-143 facebookGraphAttachment — trường attachment của Graph', () => {
  it.each([
    ['photo', 'photo'],
    ['video_inline', 'video'],
    ['video', 'video'],
    ['sticker', 'sticker'],
    ['animated_image_share', 'gif'],
    ['animated_image_autoplay', 'gif'],
  ])('%s → %s, ưu tiên media.image.src rồi url, target.id làm external_id', (fb, ours) => {
    expect(
      facebookGraphAttachment({
        type: fb,
        url: 'https://l.invalid/page',
        media: { image: { src: IMG } },
        target: { id: 't9' },
      }),
    ).toEqual([{ type: ours, url: IMG, externalId: 't9' }]);
  });
  it('không có media → dùng url; không có gì → chỉ loại', () => {
    expect(facebookGraphAttachment({ type: 'photo', url: IMG })).toEqual([
      { type: 'photo', url: IMG },
    ]);
    expect(facebookGraphAttachment({ type: 'sticker' })).toEqual([{ type: 'sticker' }]);
  });
  it('loại lạ (share, ...) hoặc thiếu → []', () => {
    expect(facebookGraphAttachment({ type: 'share', url: IMG })).toEqual([]);
    expect(facebookGraphAttachment(undefined)).toEqual([]);
  });
});

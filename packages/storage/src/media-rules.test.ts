import { describe, expect, it } from 'vitest';
import { checkMediaSet, maxBytesFor, sniffMedia } from './media-rules';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => Uint8Array.from([...value].map((c) => c.charCodeAt(0)));
const cat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));

describe('sniffMedia', () => {
  it('nhận JPEG, PNG, WebP, MP4, MOV theo nội dung', () => {
    expect(sniffMedia(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({
      kind: 'image',
      contentType: 'image/jpeg',
    });
    expect(sniffMedia(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({
      kind: 'image',
      contentType: 'image/png',
    });
    expect(sniffMedia(cat(text('RIFF'), bytes(1, 2, 3, 4), text('WEBP')))).toEqual({
      kind: 'image',
      contentType: 'image/webp',
    });
    expect(sniffMedia(cat(bytes(0, 0, 0, 24), text('ftypisom')))).toEqual({
      kind: 'video',
      contentType: 'video/mp4',
    });
    expect(sniffMedia(cat(bytes(0, 0, 0, 20), text('ftypqt  ')))).toEqual({
      kind: 'video',
      contentType: 'video/quicktime',
    });
  });

  it('từ chối nội dung lạ: HTML, GIF, RIFF không phải WebP, quá ngắn, rỗng', () => {
    for (const head of [
      text('<html><script>'),
      text('GIF89a'),
      cat(text('RIFF'), bytes(1, 2, 3, 4), text('WAVE')),
      bytes(0xff, 0xd8),
      bytes(),
    ]) {
      expect(sniffMedia(head)).toBeNull();
    }
  });
});

describe('giới hạn', () => {
  it('ảnh ≤ 8MB, video ≤ 200MB', () => {
    expect(maxBytesFor('image')).toBe(8 * 1024 * 1024);
    expect(maxBytesFor('video')).toBe(200 * 1024 * 1024);
  });

  it('một bài: tối đa 10 ảnh hoặc 1 video, không trộn', () => {
    expect(checkMediaSet([])).toBeNull();
    expect(checkMediaSet(Array(10).fill('image'))).toBeNull();
    expect(checkMediaSet(['video'])).toBeNull();
    expect(checkMediaSet(Array(11).fill('image'))).toBe('too_many_images');
    expect(checkMediaSet(['video', 'video'])).toBe('too_many_videos');
    expect(checkMediaSet(['image', 'video'])).toBe('mixed');
  });
});

import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_BYTES, createMockAvatarStore, validateAvatar } from './avatar';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

describe('validateAvatar', () => {
  it('nhận PNG và JPG theo chữ ký byte', () => {
    expect(validateAvatar(PNG, 'image/png')).toEqual({ ok: true, ext: 'png' });
    expect(validateAvatar(JPG, 'image/jpeg')).toEqual({ ok: true, ext: 'jpg' });
  });

  it('kích thước tối đa 2MB: đúng 2MB được, hơn 1 byte bị từ chối', () => {
    const atLimit = new Uint8Array(AVATAR_MAX_BYTES);
    atLimit.set(PNG);
    expect(validateAvatar(atLimit, 'image/png')).toEqual({ ok: true, ext: 'png' });
    const over = new Uint8Array(AVATAR_MAX_BYTES + 1);
    over.set(PNG);
    expect(validateAvatar(over, 'image/png')).toEqual({ ok: false, reason: 'too_large' });
    expect(AVATAR_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it('từ chối tệp rỗng', () => {
    expect(validateAvatar(new Uint8Array(0), 'image/png')).toEqual({ ok: false, reason: 'empty' });
  });

  it('từ chối loại khác (GIF, WebP, SVG, PDF) dù khai báo là ảnh', () => {
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(validateAvatar(gif, 'image/png')).toEqual({ ok: false, reason: 'type' });
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(validateAvatar(svg, 'image/png')).toEqual({ ok: false, reason: 'type' });
    expect(validateAvatar(PNG, 'image/gif')).toEqual({ ok: false, reason: 'type' });
  });

  it('chữ ký không khớp loại khai báo → từ chối (PNG khai báo là jpeg)', () => {
    expect(validateAvatar(PNG, 'image/jpeg')).toEqual({ ok: false, reason: 'type' });
  });
});

describe('createMockAvatarStore', () => {
  it('không gọi dịch vụ ngoài; trả đường dẫn cục bộ theo người dùng, KHÔNG phải https', async () => {
    const store = createMockAvatarStore();
    const url = await store.put({ userId: 'u1', bytes: PNG, ext: 'png' });
    expect(url).toMatch(/^\/avatars\/mock\/u1\/[0-9a-f]{16}\.png$/);
    await expect(store.remove({ userId: 'u1', url })).resolves.toBeUndefined();
  });
});

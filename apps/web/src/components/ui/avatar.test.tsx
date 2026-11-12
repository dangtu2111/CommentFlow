import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Avatar } from './avatar';

describe('Avatar — ảnh đại diện thật (COMMENT-AUTHOR-AVATAR)', () => {
  it('không có ảnh → hiện chữ viết tắt như cũ, không có <img>', () => {
    const html = renderToStaticMarkup(<Avatar>NA</Avatar>);
    expect(html).toContain('NA');
    expect(html).not.toContain('<img');
  });

  it('có ảnh https → hiện <img> (lazy, không gửi referrer, trang trí) và giữ huy hiệu nền tảng', () => {
    const html = renderToStaticMarkup(
      <Avatar badge="FB" src="https://scontent.xx.fbcdn.net/v/a.jpg?oh=1">
        NA
      </Avatar>,
    );
    expect(html).toContain('<img');
    expect(html).toContain('src="https://scontent.xx.fbcdn.net/v/a.jpg?oh=1"');
    expect(html).toContain('loading="lazy"');
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
    expect(html).toContain('alt=""');
    expect(html).toContain('FB');
  });

  it('ảnh http, javascript:, chuỗi lạ, rỗng, null → quay về chữ viết tắt (không <img>)', () => {
    for (const bad of ['http://x.test/a.jpg', 'javascript:alert(1)', 'khong-phai-url', '', null]) {
      const html = renderToStaticMarkup(<Avatar src={bad}>NA</Avatar>);
      expect(html, String(bad)).not.toContain('<img');
      expect(html).toContain('NA');
    }
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Breadcrumb } from './page-header';
import { RailNav } from './rail-nav';

const GROUPS = [
  {
    key: 'structure',
    title: 'Cấu trúc',
    items: [
      { key: 'a', href: '/a', label: 'Mục A', current: true },
      { key: 'b', href: '/b', label: 'Mục B', current: false },
    ],
  },
  {
    key: 'tuning',
    title: 'Tinh chỉnh',
    items: [{ key: 'c', href: '/c', label: 'Mục C', current: false }],
  },
];

describe('UI-KIT RailNav', () => {
  it('mỗi nhóm có tiêu đề, mỗi mục là liên kết thật', () => {
    const html = renderToStaticMarkup(<RailNav label="Điều hướng" groups={GROUPS} />);
    expect(html).toContain('aria-label="Điều hướng"');
    expect(html).toContain('Cấu trúc');
    expect(html).toContain('Tinh chỉnh');
    expect(html).toContain('href="/c"');
  });

  it('đúng một mục có aria-current="page"', () => {
    const html = renderToStaticMarkup(<RailNav label="Điều hướng" groups={GROUPS} />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it('mục đầu (không nhóm) hiện trước các nhóm khi có `lead`', () => {
    const html = renderToStaticMarkup(
      <RailNav
        label="Điều hướng"
        groups={GROUPS}
        lead={{ key: 'home', href: '/', label: 'Tổng quan', current: false }}
      />,
    );
    expect(html.indexOf('Tổng quan')).toBeLessThan(html.indexOf('Cấu trúc'));
  });
});

describe('UI-KIT Breadcrumb nhiều cấp', () => {
  it('hiện các cấp cha rồi trang hiện tại (aria-current)', () => {
    const html = renderToStaticMarkup(
      <Breadcrumb label="Đường dẫn" parents={['Vận hành', 'Nội dung']} current="Bài viết" />,
    );
    expect(html.indexOf('Vận hành')).toBeLessThan(html.indexOf('Nội dung'));
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/›/g)).toHaveLength(2);
  });

  it('vẫn nhận `root` như cũ', () => {
    const html = renderToStaticMarkup(
      <Breadcrumb label="Đường dẫn" root="Cài đặt" current="Bảo mật" />,
    );
    expect(html).toContain('Cài đặt');
    expect(html.match(/›/g)).toHaveLength(1);
  });
});

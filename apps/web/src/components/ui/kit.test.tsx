import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Avatar } from './avatar';
import { Button, buttonClass, IconButton } from './button';
import { Chip } from './chip';
import { SplitLayout } from './split-layout';
import { Stat } from './stat';
import { Tabs } from './tabs';

const ITEMS = [
  { key: 'login', href: '/login', label: 'Đăng nhập', current: true },
  { key: 'register', href: '/register', label: 'Đăng ký', current: false },
];

describe('UI-KIT Tabs', () => {
  it('chỉ tab hiện tại có aria-current="page", mỗi tab là liên kết thật', () => {
    const html = renderToStaticMarkup(<Tabs items={ITEMS} label="Tài khoản" />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/register"');
    expect(html).toContain('aria-label="Tài khoản"');
  });

  it('biến thể section dùng class riêng', () => {
    const html = renderToStaticMarkup(<Tabs items={ITEMS} label="Mục" variant="section" />);
    expect(html).toContain('section-tabs');
    expect(html).toContain('section-tab"');
    expect(html).not.toContain('class="tabs"');
  });
});

describe('UI-KIT Button', () => {
  it('buttonClass ghép biến thể, block và class thêm', () => {
    expect(buttonClass()).toBe('btn btn-primary');
    expect(buttonClass({ variant: 'danger-ghost', block: true, className: 'x' })).toBe(
      'btn btn-danger-ghost btn-block x',
    );
  });

  it('type mặc định là button (không vô tình gửi form)', () => {
    expect(renderToStaticMarkup(<Button>Lưu</Button>)).toContain('type="button"');
    expect(renderToStaticMarkup(<Button type="submit">Lưu</Button>)).toContain('type="submit"');
  });

  it('IconButton luôn có aria-label', () => {
    const html = renderToStaticMarkup(<IconButton label="Đóng">x</IconButton>);
    expect(html).toContain('aria-label="Đóng"');
    expect(html).toContain('icon-button');
  });
});

describe('UI-KIT Chip, Avatar, Stat, SplitLayout', () => {
  it('Chip mặc định tone muted, đổi tone đổi class', () => {
    expect(renderToStaticMarkup(<Chip>a</Chip>)).toContain('chip chip-muted');
    expect(renderToStaticMarkup(<Chip tone="success">a</Chip>)).toContain('chip chip-success');
  });

  it('Avatar ẩn khỏi trình đọc màn hình; md không thêm hậu tố; ai thêm avatar-ai', () => {
    const md = renderToStaticMarkup(<Avatar>AB</Avatar>);
    expect(md).toContain('class="avatar"');
    expect(md).toContain('aria-hidden="true"');
    expect(
      renderToStaticMarkup(
        <Avatar size="sm" ai>
          AI
        </Avatar>,
      ),
    ).toContain('avatar avatar-sm avatar-ai');
  });

  it('Stat chỉ hiện ghi chú khi có; noteOk thêm is-ok', () => {
    expect(renderToStaticMarkup(<Stat label="Email" value="a@b.c" />)).not.toContain(
      'info-tile-note',
    );
    expect(
      renderToStaticMarkup(<Stat label="Email" value="a@b.c" note="Đã xác minh" noteOk />),
    ).toContain('info-tile-note is-ok');
  });

  it('SplitLayout đánh dấu mục hiện tại và hiện số đếm khi có', () => {
    const html = renderToStaticMarkup(
      <SplitLayout
        navLabel="Cài đặt"
        navTitle="CẤU HÌNH"
        items={[
          { key: 'a', href: '/a', label: 'A', icon: null, count: '2/3', current: true },
          { key: 'b', href: '/b', label: 'B', icon: null, count: null, current: false },
        ]}
      >
        nội dung
      </SplitLayout>,
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('settings-subnav-count');
    expect(html).toContain('nội dung');
  });
});

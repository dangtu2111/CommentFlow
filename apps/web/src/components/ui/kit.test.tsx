import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Avatar } from './avatar';
import { Button, buttonClass, IconButton } from './button';
import { Chip } from './chip';
import { Icon } from './icon';
import { Inset } from './inset';
import { Kbd } from './kbd';
import { PageHeader } from './page-header';
import { SectionHead } from './section-head';
import { SplitLayout } from './split-layout';
import { Stat } from './stat';
import { Stepper } from './stepper';
import { Tabs } from './tabs';
import {
  Workbench,
  WorkbenchDetail,
  WorkbenchFilters,
  WorkbenchList,
  WorkbenchStrip,
} from './workbench';

const ITEMS = [
  { key: 'login', href: '/login', label: 'Đăng nhập', current: true },
  { key: 'register', href: '/register', label: 'Đăng ký', current: false },
];

describe('UI-KIT Inset', () => {
  it('có tiêu đề + biểu tượng ẩn với trình đọc màn hình; không tiêu đề thì không dựng phần đầu', () => {
    const withTitle = renderToStaticMarkup(
      <Inset title="Ngưỡng" icon={<i />} className="x">
        nội dung
      </Inset>,
    );
    expect(withTitle).toContain('inset x');
    expect(withTitle).toContain('Ngưỡng');
    expect(withTitle).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<Inset>chỉ nội dung</Inset>)).not.toContain('inset-head');
  });
});

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

describe('UI-KIT Tabs pill, Avatar badge, Stepper', () => {
  it('biến thể pill dùng class pill-tabs', () => {
    const html = renderToStaticMarkup(<Tabs items={ITEMS} label="Nền tảng" variant="pill" />);
    expect(html).toContain('pill-tabs');
    expect(html).toContain('pill-tab"');
  });

  it('Avatar chỉ vẽ huy hiệu khi có badge', () => {
    expect(renderToStaticMarkup(<Avatar>AB</Avatar>)).not.toContain('avatar-badge');
    expect(renderToStaticMarkup(<Avatar badge="FB">AB</Avatar>)).toContain(
      '<span class="avatar-badge">FB</span>',
    );
  });

  it('Stepper: chỉ bước hiện tại có aria-current="step", có thanh tiến độ khi truyền progress', () => {
    const steps = [
      { key: 'a', state: 'done' as const, title: 'A' },
      { key: 'b', state: 'current' as const, title: 'B', eyebrow: 'Bước 2', caption: 'Đang làm' },
      { key: 'c', state: 'todo' as const, title: 'C' },
    ];
    const html = renderToStaticMarkup(<Stepper label="Các bước" steps={steps} progress={50} />);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('<ol');
    expect(html).toContain('--stepper-cols:3');
    expect(html).toContain('width:50%');
    expect(renderToStaticMarkup(<Stepper label="x" steps={steps} />)).not.toContain('stepper-bar');
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

  it('SplitLayout đặt header phía trên lưới hai cột (không còn thủ thuật trải hàng)', () => {
    const html = renderToStaticMarkup(
      <SplitLayout navLabel="Cài đặt" navTitle="CẤU HÌNH" items={[]} header={<h1>Đầu trang</h1>}>
        <section>thẻ</section>
      </SplitLayout>,
    );
    expect(html.indexOf('Đầu trang')).toBeLessThan(html.indexOf('settings-body'));
    expect(html.indexOf('settings-body')).toBeLessThan(html.indexOf('settings-subnav'));
    expect(html.indexOf('settings-subnav')).toBeLessThan(html.indexOf('settings-content'));
    expect(html).toContain('thẻ');
  });
});

describe('UI-KIT Workbench + Kbd', () => {
  it('Workbench dựng dải phụ, ba cột đúng loại và data-pane cho mobile', () => {
    const html = renderToStaticMarkup(
      <Workbench strip={<WorkbenchStrip>Tiêu đề</WorkbenchStrip>} pane="detail">
        <WorkbenchFilters>a</WorkbenchFilters>
        <WorkbenchList>b</WorkbenchList>
        <WorkbenchDetail>c</WorkbenchDetail>
      </Workbench>,
    );
    expect(html).toContain('data-pane="detail"');
    expect(html).toContain('class="wb-strip"');
    expect(html).toContain('<div class="wb-pane wb-pane-filters">a</div>');
    expect(html).toContain('wb-pane-list');
    expect(html).toContain('<aside class="wb-pane wb-pane-detail">');
  });

  it('Icon vẽ SVG nội tuyến tô theo currentColor, trang trí', () => {
    const html = renderToStaticMarkup(<Icon name="shield" size={14} />);
    expect(html).toContain('viewBox="0 -960 960 960"');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('width="14"');
  });

  it('Kbd vẽ thẻ kbd', () => {
    expect(renderToStaticMarkup(<Kbd>H</Kbd>)).toBe('<kbd class="kbd">H</kbd>');
  });
});

describe('UI-KIT SectionHead + PageHeader (Cài đặt, HTML-first)', () => {
  it('SectionHead: biểu tượng trần mặc định, ô nền chính khi hero', () => {
    const plain = renderToStaticMarkup(<SectionHead id="a" icon="i" title="T" />);
    expect(plain).toContain('class="section-head-icon"');
    const hero = renderToStaticMarkup(<SectionHead id="a" hero icon="i" title="T" />);
    expect(hero).toContain('section-head-icon is-hero');
  });

  it('PageHeader là MỘT phần tử đầu trang (mô tả không rơi sang cột phải của lưới)', () => {
    const html = renderToStaticMarkup(<PageHeader title="T" subtitle="S" />);
    expect(html.startsWith('<header')).toBe(true);
    expect(html).toContain('<h1 class="page-title">T</h1>');
  });
});

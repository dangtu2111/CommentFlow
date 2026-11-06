import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Chip } from './chip';
import { MetricCard } from './metric-card';
import { PageHeader } from './page-header';
import { Progress } from './progress';
import { Switch } from './switch';
import { Tabs } from './tabs';

describe('UI-KIT Switch', () => {
  it('là checkbox role=switch; disabled thì aria-disabled', () => {
    const on = renderToStaticMarkup(<Switch name="x" defaultChecked label="Đang bật" />);
    expect(on).toContain('type="checkbox"');
    expect(on).toContain('checked');
    expect(on).not.toContain('aria-disabled');
    const off = renderToStaticMarkup(<Switch disabled label="Sắp có" />);
    expect(off).toContain('aria-disabled="true"');
    expect(off).toContain('is-disabled');
  });
});

describe('UI-KIT Progress', () => {
  it('cắt giá trị về 0–100 và gộp các đoạn', () => {
    const html = renderToStaticMarkup(
      <Progress label="Dùng" segments={[{ percent: 150 }, { percent: -5, tone: 'warm' }]} />,
    );
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('width:100%');
    expect(html).toContain('width:0%');
    expect(html).toContain('aria-label="Dùng"');
  });
  it('NaN → 0', () => {
    expect(
      renderToStaticMarkup(<Progress label="x" segments={[{ percent: Number.NaN }]} />),
    ).toContain('aria-valuenow="0"');
  });
});

describe('UI-KIT MetricCard', () => {
  it('value null → "—", sample gắn nhãn [MẪU]', () => {
    const none = renderToStaticMarkup(<MetricCard label="Đã gửi" value={null} icon={<i />} />);
    expect(none).toContain('—');
    expect(none).not.toContain('[MẪU]');
    const sample = renderToStaticMarkup(
      <MetricCard label="Đã gửi" value={142} unit="câu" icon={<i />} sample />,
    );
    expect(sample).toContain('142');
    expect(sample).toContain('[MẪU]');
  });
});

describe('UI-KIT Tabs toolbar + Chip + PageHeader', () => {
  it('tab disabled không phải liên kết, có ghi chú cho trình đọc màn hình', () => {
    const html = renderToStaticMarkup(
      <Tabs
        variant="toolbar"
        label="Mục"
        disabledNote="Sắp có"
        items={[
          { key: 'a', href: '#a', label: 'A', current: true, badge: '4' },
          { key: 'b', href: '#b', label: 'B', current: false, disabled: true },
        ]}
      />,
    );
    expect(html).toContain('toolbar-tabs');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Sắp có');
    expect(html).toContain('tab-badge');
  });
  it('Chip có tông mới', () => {
    expect(renderToStaticMarkup(<Chip tone="locked">x</Chip>)).toContain('chip-locked');
  });
  it('PageHeader: không icon/actions giữ bố cục cũ; có thì dùng page-header-rich', () => {
    expect(renderToStaticMarkup(<PageHeader title="T" />)).toContain('stack-tight');
    const rich = renderToStaticMarkup(
      <PageHeader
        title="T"
        icon={<i />}
        badge={<b>B</b>}
        actions={<button type="button">Đi</button>}
      />,
    );
    expect(rich).toContain('page-header-rich');
    expect(rich).toContain('page-title-row');
    expect(rich).toContain('page-header-actions');
  });
});

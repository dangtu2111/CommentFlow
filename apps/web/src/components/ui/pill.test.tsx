import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Pill } from './pill';

describe('Pill (Tailwind)', () => {
  it('mặc định là nhãn xám bo tròn', () => {
    const html = renderToStaticMarkup(<Pill>Nhãn</Pill>);
    expect(html).toContain('rounded-full');
    expect(html).toContain('bg-surface-container-high');
  });

  it('giữ cả cỡ chữ lẫn màu chữ (không bị tailwind-merge nuốt text-label-sm)', () => {
    const html = renderToStaticMarkup(<Pill tone="primary">Nhãn</Pill>);
    expect(html).toContain('text-label-sm');
    expect(html).toContain('text-on-primary');
  });

  it('đổi tông và hình dạng theo biến thể', () => {
    const html = renderToStaticMarkup(
      <Pill tone="danger" shape="box">
        Lỗi
      </Pill>,
    );
    expect(html).toContain('bg-error-container');
    expect(html).not.toContain('rounded-full');
  });
});

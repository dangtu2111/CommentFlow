import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PostCard } from './post-card';

const base = { meta: <span>Meta</span>, snippet: 'Nội dung bài', stats: <span>Thống kê</span> };

describe('PostCard (Tailwind, design/stitch/posts.html)', () => {
  it('bài có bình luận chờ có vạch nhấn trái và data-pending', () => {
    const html = renderToStaticMarkup(<PostCard {...base} pending />);
    expect(html).toContain('data-pending="true"');
    expect(html).toContain('bg-primary-container');
    expect(html).toContain('w-1.5');
  });

  it('bài không chờ thì không có vạch nhấn', () => {
    const html = renderToStaticMarkup(<PostCard {...base} pending={false} />);
    expect(html).not.toContain('data-pending');
    expect(html).not.toContain('w-1.5');
  });

  it('chỉ có tiêu đề khi được truyền; luôn có khung ảnh và đoạn trích', () => {
    const without = renderToStaticMarkup(<PostCard {...base} pending={false} />);
    expect(without).not.toContain('<h3');
    expect(without).toContain('Nội dung bài');
    const withTitle = renderToStaticMarkup(<PostCard {...base} pending={false} title="Tiêu đề" />);
    expect(withTitle).toContain('<h3');
    expect(withTitle).toContain('Tiêu đề');
  });

  it('hiện huy hiệu và phần chân khi có', () => {
    const html = renderToStaticMarkup(
      <PostCard {...base} pending={false} badge={<b>Huy hiệu</b>} footer={<i>Chân</i>} />,
    );
    expect(html).toContain('Huy hiệu');
    expect(html).toContain('Chân');
  });
});

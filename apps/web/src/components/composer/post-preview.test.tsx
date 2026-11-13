import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import vi_messages from '../../../../../packages/shared/src/i18n/messages/vi.json';
import type { ComposerMedia } from './media-uploader';
import { handleOf, PostPreview, type PreviewProps } from './post-preview';

const img = (n: number): ComposerMedia => ({
  id: `m${n}`,
  kind: 'image',
  contentType: 'image/png',
  sizeBytes: 10,
});
const video: ComposerMedia = { id: 'v1', kind: 'video', contentType: 'video/mp4', sizeBytes: 10 };
const render = (over: Partial<PreviewProps> = {}) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={vi_messages}>
      <PostPreview platform="facebook" pageName="Lụa Tơ Tằm" text="" media={[]} {...over} />
    </NextIntlClientProvider>,
  );
const photos = (html: string) => (html.match(/<img /g) ?? []).length;

describe('handleOf', () => {
  it('tên tài khoản kiểu Instagram: bỏ dấu, chữ thường, gạch dưới', () => {
    expect(handleOf('KIM TAM · Lụa Tơ Tằm Nha Xá')).toBe('kim_tam_lua_to_tam_nha_xa');
    expect(handleOf('Đồ Đẹp!!')).toBe('do_dep');
    expect(handleOf(null)).toBe('');
    expect(handleOf('   ')).toBe('');
  });
});

describe('Facebook', () => {
  it('đầu bài có tên kênh, "Vừa xong", chữ cái đầu làm ảnh đại diện; thanh phản ứng và Thích/Bình luận/Chia sẻ; bộ đếm = 0', () => {
    const html = render({ text: 'Xin chào' });
    expect(html).toContain('Lụa Tơ Tằm');
    expect(html).toContain('Vừa xong');
    expect(html).toContain('>L<');
    expect(html).toContain('Thích');
    expect(html).toContain('Chia sẻ');
    expect(html).toContain('0 bình luận');
    expect(render({ pageName: null })).toContain('Chưa chọn kênh');
  });

  it('nội dung dài bị cắt kèm "Xem thêm"; hashtag và liên kết được tô màu', () => {
    const long = render({ text: `${'a'.repeat(300)} #cuoi` });
    expect(long).toContain('Xem thêm');
    expect(long).not.toContain('#cuoi');
    const tagged = render({ text: 'Hàng mới #aothun https://shop.vn/a' });
    expect(tagged).toMatch(/<span class="text-primary">#aothun<\/span>/);
    expect(tagged).toMatch(/<span class="text-primary">https:\/\/shop\.vn\/a<\/span>/);
    expect(render({ text: 'ngắn' })).not.toContain('Xem thêm');
  });

  it('lưới ảnh: 1, 2, 3, 4 ảnh đủ ảnh; từ 5 ảnh chỉ 5 ô và ô cuối "+N"; video có điều khiển', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(photos(render({ media: Array.from({ length: n }, (_, i) => img(i)) }))).toBe(n);
    }
    const eight = render({ media: Array.from({ length: 8 }, (_, i) => img(i)) });
    expect(photos(eight)).toBe(5);
    expect(eight).toContain('+3');
    const five = render({ media: Array.from({ length: 5 }, (_, i) => img(i)) });
    expect(five).not.toContain('+0');
    const v = render({ media: [video] });
    expect(v).toContain('<video');
    expect(v).toContain('controls');
  });
});

describe('Instagram', () => {
  it('tên tài khoản từ tên kênh, khung vuông, hàng biểu tượng, "0 lượt thích", chú thích kèm tên', () => {
    const html = render({ platform: 'instagram', text: 'Bộ sưu tập mới', media: [img(1)] });
    expect(html).toContain('lua_to_tam');
    expect(html).toContain('aspect-square');
    expect(html).toContain('0 lượt thích');
    expect(html).toContain('Bộ sưu tập mới');
    expect(photos(html)).toBe(1);
  });

  it('nhiều ảnh: chỉ hiện ảnh đầu kèm "1/N", chấm chỉ báo và nút chuyển; không có media → nhắc cần ảnh/video', () => {
    const many = render({ platform: 'instagram', media: [img(1), img(2), img(3)] });
    expect(many).toContain('1/3');
    expect(photos(many)).toBe(1);
    expect(many).toContain('Ảnh sau');
    const none = render({ platform: 'instagram', text: 'x' });
    expect(none).toContain('Instagram cần ít nhất một ảnh hoặc video');
  });

  it('chú thích dài bị cắt kèm "xem thêm"', () => {
    expect(render({ platform: 'instagram', text: 'b'.repeat(200) })).toContain('xem thêm');
  });
});

describe('TikTok', () => {
  it('khung dọc 9:16 với @tên, chú thích và cột biểu tượng; không có video → nhắc cần video', () => {
    const html = render({ platform: 'tiktok', text: 'Mẫu mới', media: [video] });
    expect(html).toContain('aspect-[9/16]');
    expect(html).toContain('@lua_to_tam');
    expect(html).toContain('Mẫu mới');
    expect(html).toContain('<video');
    expect(render({ platform: 'tiktok' })).toContain('TikTok cần một video');
  });
});

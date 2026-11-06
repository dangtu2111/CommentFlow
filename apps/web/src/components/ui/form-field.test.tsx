import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormField } from './form-field';

describe('UI-KIT FormField', () => {
  it('nhãn trỏ đúng ô nhập, không có gợi ý/lỗi thì không có aria-describedby', () => {
    const html = renderToStaticMarkup(
      <FormField id="f1" label="Email">
        {(control) => <input {...control} />}
      </FormField>,
    );
    expect(html).toContain('for="f1"');
    expect(html).toContain('id="f1"');
    expect(html).not.toContain('aria-describedby');
    expect(html).not.toContain('aria-invalid');
  });

  it('gợi ý được liên kết bằng aria-describedby', () => {
    const html = renderToStaticMarkup(
      <FormField id="f2" label="Tên" hint="Hiển thị cho cả nhóm">
        {(control) => <input {...control} />}
      </FormField>,
    );
    expect(html).toContain('aria-describedby="f2-hint"');
    expect(html).toContain('id="f2-hint"');
  });

  it('lỗi thay thế gợi ý và gắn aria-invalid', () => {
    const html = renderToStaticMarkup(
      <FormField id="f3" label="Mã" hint="6 số" error="Mã sai">
        {(control) => <input {...control} />}
      </FormField>,
    );
    expect(html).toContain('aria-describedby="f3-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('Mã sai');
    expect(html).not.toContain('6 số');
  });

  it('liên kết phụ nằm cùng hàng với nhãn', () => {
    const html = renderToStaticMarkup(
      <FormField id="f4" label="Mật khẩu" aux={<a href="/quen">Quên?</a>}>
        {(control) => <input {...control} />}
      </FormField>,
    );
    expect(html).toContain('field-aux');
    expect(html).toContain('Quên?');
  });
});

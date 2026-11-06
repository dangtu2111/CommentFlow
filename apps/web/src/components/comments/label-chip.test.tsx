import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LabelChip, StatusChip } from './label-chip';
import { InlineError, StateNote } from './state-note';

describe('LabelChip (nhãn ý định, màu theo HTML Stitch)', () => {
  it('mỗi nhãn chuẩn có tông màu riêng; Hỏi giá có chấm, Mua hàng có biểu tượng', () => {
    const price = renderToStaticMarkup(<LabelChip label="price">Hỏi giá</LabelChip>);
    expect(price).toContain('bg-primary-fixed');
    expect(price).toContain('bg-primary-container');
    const purchase = renderToStaticMarkup(<LabelChip label="purchase">Mua hàng</LabelChip>);
    expect(purchase).toContain('bg-secondary-fixed');
    expect(purchase).toContain('<svg');
    const complaint = renderToStaticMarkup(<LabelChip label="complaint">Khiếu nại</LabelChip>);
    expect(complaint).toContain('bg-error-container');
  });

  it('nhãn lạ hoặc rỗng → tông trung tính; lead=false bỏ chấm/biểu tượng', () => {
    expect(renderToStaticMarkup(<LabelChip label="xyz">X</LabelChip>)).toContain(
      'bg-surface-container ',
    );
    expect(renderToStaticMarkup(<LabelChip label={null}>X</LabelChip>)).not.toContain('<svg');
    const legend = renderToStaticMarkup(
      <LabelChip label="purchase" lead={false}>
        Mua hàng
      </LabelChip>,
    );
    expect(legend).not.toContain('<svg');
  });
});

describe('StatusChip', () => {
  it('trạng thái nguy hiểm dùng màu lỗi, trạng thái lạ trung tính', () => {
    expect(renderToStaticMarkup(<StatusChip status="send_failed">Lỗi</StatusChip>)).toContain(
      'bg-error-container',
    );
    expect(renderToStaticMarkup(<StatusChip status="lạ">?</StatusChip>)).toContain(
      'bg-surface-container ',
    );
  });
});

describe('StateNote / InlineError', () => {
  it('giữ role do nơi gọi chọn và hiện tiêu đề', () => {
    const html = renderToStaticMarkup(
      <StateNote tone="danger" role="alert" title="Gửi lỗi">
        <p>chi tiết</p>
      </StateNote>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Gửi lỗi');
    expect(html).toContain('chi tiết');
  });

  it('InlineError có role=alert và id để aria-describedby trỏ tới', () => {
    const html = renderToStaticMarkup(<InlineError id="e1">Lỗi</InlineError>);
    expect(html).toContain('role="alert"');
    expect(html).toContain('id="e1"');
  });
});

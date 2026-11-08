import { describe, expect, it } from 'vitest';
import { conflictChunkOf, detectConflicts } from './conflicts';
import { buildPolicyDocuments, splitSections } from './policy-documents';
import { buildFaqDocuments, buildProductDocuments, buildShopDocuments } from './source-documents';
import { classifyTopic } from './topic';

describe('splitSections — cắt theo mục', () => {
  it('cắt theo dòng tiêu đề ## và giữ tiêu đề làm tên mục', () => {
    const s = splitSections(
      'Mở đầu\n\n## Thời gian giao\nGiao trong 2 ngày.\n\n## Phí giao\nMiễn phí từ 500k.',
    );
    expect(s).toEqual([
      { heading: null, body: 'Mở đầu' },
      { heading: 'Thời gian giao', body: 'Giao trong 2 ngày.' },
      { heading: 'Phí giao', body: 'Miễn phí từ 500k.' },
    ]);
  });
  it('không có tiêu đề → một mục duy nhất; bỏ mục rỗng', () => {
    expect(splitSections('Chỉ một đoạn.')).toEqual([{ heading: null, body: 'Chỉ một đoạn.' }]);
    expect(splitSections('## A\n\n## B\nnội dung')).toEqual([{ heading: 'B', body: 'nội dung' }]);
  });
});

describe('classifyTopic', () => {
  it.each([
    ['Giao hàng trong 2-3 ngày làm việc', 'shipping', 'shipping_time'],
    ['Phí vận chuyển 30.000đ, miễn phí đơn từ 500k', 'shipping', 'shipping_fee'],
    ['Đổi trả trong 7 ngày nếu lỗi', 'return', 'return'],
    ['Hoàn tiền trong 5 ngày làm việc', 'return', 'refund'],
    ['Bảo hành 12 tháng', 'warranty', 'warranty'],
    ['Thanh toán COD hoặc chuyển khoản', 'payment', 'payment'],
    ['Lời chào chung', 'other', 'other'],
  ])('%s', (text, kind, topic) => {
    expect(classifyTopic(text, kind as never)).toBe(topic);
  });
});

describe('buildPolicyDocuments', () => {
  it('mỗi mục thành một tài liệu có section, chunkKey ổn định, topic theo nội dung', () => {
    const docs = buildPolicyDocuments(
      [
        {
          id: 'p1',
          kind: 'shipping',
          lang: 'vi',
          title: 'Chính sách giao hàng',
          content: '## Thời gian\nGiao trong 2 ngày.\n\n## Phí\nPhí ship 30.000đ.',
        },
      ],
      'Chính sách cửa hàng',
    );
    expect(docs.map((d) => [d.doc.key, d.doc.section, d.topic])).toEqual([
      ['policy:p1:0', 'Chính sách giao hàng › Thời gian', 'shipping_time'],
      ['policy:p1:1', 'Chính sách giao hàng › Phí', 'shipping_fee'],
    ]);
    expect(docs[0]?.doc.sourceTitle).toBe('Chính sách cửa hàng');
    expect(docs[0]?.doc.kind).toBe('policy');
  });
});

describe('detectConflicts — số + đơn vị cùng chủ đề', () => {
  const chunk = (key: string, source: string, text: string, topic: never) => ({
    chunkKey: key,
    sourceTitle: source,
    text,
    topic,
  });
  it('hai nguồn nói thời gian giao khác nhau → một nhóm mâu thuẫn nêu 2 câu + nguồn', () => {
    const groups = detectConflicts([
      chunk('policy:a:0#0', 'Chính sách A', 'Giao hàng trong 2 ngày.', 'shipping_time' as never),
      chunk('policy:b:0#0', 'Chính sách B', 'Thời gian giao 5 ngày.', 'shipping_time' as never),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.topic).toBe('shipping_time');
    expect(groups[0]?.values).toEqual(['2 ngày', '5 ngày']);
    expect(groups[0]?.members.map((m) => [m.chunkKey, m.sourceTitle, m.sentence])).toEqual([
      ['policy:a:0#0', 'Chính sách A', 'Giao hàng trong 2 ngày.'],
      ['policy:b:0#0', 'Chính sách B', 'Thời gian giao 5 ngày.'],
    ]);
  });
  it('cùng giá trị → không mâu thuẫn; khác chủ đề → không so; khác đơn vị (ngày vs giờ) → không so', () => {
    expect(
      detectConflicts([
        chunk('a#0', 'A', 'Giao 2 ngày.', 'shipping_time' as never),
        chunk('b#0', 'B', 'Giao trong 2 ngày.', 'shipping_time' as never),
      ]),
    ).toEqual([]);
    expect(
      detectConflicts([
        chunk('a#0', 'A', 'Giao 2 ngày.', 'shipping_time' as never),
        chunk('b#0', 'B', 'Đổi trả 7 ngày.', 'return' as never),
      ]),
    ).toEqual([]);
    expect(
      detectConflicts([
        chunk('a#0', 'A', 'Giao 2 ngày.', 'shipping_time' as never),
        chunk('b#0', 'B', 'Giao nội thành 4 giờ.', 'shipping_time' as never),
      ]),
    ).toEqual([]);
  });
  it('phí: so tiền cùng đơn vị (30.000đ vs 25k)', () => {
    const groups = detectConflicts([
      chunk('a#0', 'A', 'Phí ship 30.000đ.', 'shipping_fee' as never),
      chunk('b#0', 'B', 'Phí vận chuyển 25k.', 'shipping_fee' as never),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.values).toEqual(['25000đ', '30000đ']);
  });
  it('cùng một nguồn nhắc hai con số khác nhau KHÔNG tự coi là mâu thuẫn (chỉ so giữa các nguồn)', () => {
    expect(
      detectConflicts([
        chunk('a#0', 'A', 'Nội thành 2 ngày, tỉnh 5 ngày.', 'shipping_time' as never),
      ]),
    ).toEqual([]);
  });
  it('hai chính sách CÙNG tên nguồn hiển thị nhưng khác originKey vẫn bị so (mâu thuẫn giữa hai chính sách)', () => {
    const groups = detectConflicts([
      {
        chunkKey: 'policy:a:0#0',
        sourceTitle: 'Chính sách cửa hàng › A',
        originKey: 'policy:a',
        text: 'Giao 2 ngày.',
        topic: 'shipping_time',
      },
      {
        chunkKey: 'policy:b:0#0',
        sourceTitle: 'Chính sách cửa hàng › B',
        originKey: 'policy:b',
        text: 'Giao 5 ngày.',
        topic: 'shipping_time',
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.group).toBe('shipping_time:ngày');
  });
  it('cùng originKey (một chính sách tự nhắc hai số) không bị coi là mâu thuẫn', () => {
    expect(
      detectConflicts([
        {
          chunkKey: 'policy:a:0#0',
          sourceTitle: 'X',
          originKey: 'policy:a',
          text: 'Nội thành 2 ngày.',
          topic: 'shipping_time',
        },
        {
          chunkKey: 'policy:a:1#0',
          sourceTitle: 'Y',
          originKey: 'policy:a',
          text: 'Tỉnh 5 ngày.',
          topic: 'shipping_time',
        },
      ]),
    ).toEqual([]);
  });
  it('conflictChunkOf: nguồn thật là tài liệu gốc, tên hiển thị là context_header, topic lạ → other', () => {
    expect(
      conflictChunkOf({
        chunkKey: 'policy:p1:2#0',
        content: 'x',
        contextHeader: 'CS › Giao',
        sourceTitle: 'S',
        topic: 'shipping_time',
      }),
    ).toEqual({
      chunkKey: 'policy:p1:2#0',
      sourceTitle: 'CS › Giao',
      originKey: 'policy:p1',
      text: 'x',
      topic: 'shipping_time',
    });
    expect(
      conflictChunkOf({
        chunkKey: 'faq:f1#0',
        content: 'x',
        contextHeader: null,
        sourceTitle: 'FAQ',
        topic: null,
      }),
    ).toMatchObject({
      sourceTitle: 'FAQ',
      originKey: 'faq:f1#0',
      topic: 'other',
    });
  });
  it('phí bằng USD được chuẩn hóa riêng đơn vị (không so với VND)', () => {
    const groups = detectConflicts([
      { chunkKey: 'a#0', sourceTitle: 'A', text: 'Shipping fee 5 USD.', topic: 'shipping_fee' },
      { chunkKey: 'b#0', sourceTitle: 'B', text: 'Phí ship 8 usd.', topic: 'shipping_fee' },
      { chunkKey: 'c#0', sourceTitle: 'C', text: 'Phí ship 30.000đ.', topic: 'shipping_fee' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.group).toBe('shipping_fee:usd');
    expect(groups[0]?.values).toEqual(['5 USD', '8 USD']);
  });
});

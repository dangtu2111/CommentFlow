import { KB_GAP_TOPICS } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { getMessages } from '../i18n/messages';
import { groupGapsByTopic, parseKbGapFilter, parseKbGapForm, toKbGapViews } from './kb-gaps-form';

const ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const form = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe('FR-134 FR-141 bộ lọc trang Câu hỏi AI chưa trả lời được', () => {
  it('FR-134 mặc định chỉ xem mục đang mở, không lọc chủ đề', () => {
    expect(parseKbGapFilter({})).toEqual({ status: 'open' });
  });

  it('FR-134 nhận chủ đề và trạng thái hợp lệ; giá trị lạ hoặc mảng bị bỏ', () => {
    expect(parseKbGapFilter({ topic: 'size', status: 'ignored' })).toEqual({
      topic: 'size',
      status: 'ignored',
    });
    expect(parseKbGapFilter({ topic: 'hack', status: 'x' })).toEqual({ status: 'open' });
    expect(parseKbGapFilter({ topic: ['size', 'policy'] })).toEqual({ status: 'open' });
  });
});

describe('FR-134 UF-11 kiểm form bổ sung kiến thức', () => {
  it('FR-134 bổ sung: cần id hợp lệ, câu hỏi, câu trả lời; cắt khoảng trắng', () => {
    const r = parseKbGapForm(
      form({
        intent: 'resolve',
        gapId: ID,
        question: '  Ship Hà Nội bao nhiêu?  ',
        answer: ' 20.000đ ',
        lang: 'vi',
      }),
    );
    expect(r).toEqual({
      ok: true,
      action: {
        intent: 'resolve',
        gapId: ID,
        faq: { question: 'Ship Hà Nội bao nhiêu?', answer: '20.000đ', lang: 'vi', tags: [] },
      },
    });
  });

  it('FR-134 bổ sung thiếu câu trả lời hoặc ngôn ngữ lạ → lỗi, giữ nguyên câu đã gõ', () => {
    expect(
      parseKbGapForm(
        form({ intent: 'resolve', gapId: ID, question: 'q', answer: '  ', lang: 'vi' }),
      ),
    ).toEqual({ ok: false, code: 'invalid_faq' });
    expect(
      parseKbGapForm(
        form({ intent: 'resolve', gapId: ID, question: 'q', answer: 'a', lang: 'fr' }),
      ),
    ).toEqual({ ok: false, code: 'invalid_faq' });
  });

  it('FR-134 bỏ qua / mở lại chỉ cần id', () => {
    expect(parseKbGapForm(form({ intent: 'ignore', gapId: ID }))).toEqual({
      ok: true,
      action: { intent: 'ignore', gapId: ID },
    });
    expect(parseKbGapForm(form({ intent: 'reopen', gapId: ID }))).toEqual({
      ok: true,
      action: { intent: 'reopen', gapId: ID },
    });
  });

  it('FR-134 id không phải UUID hoặc ý định lạ → bad_request (nơi gọi trả 404)', () => {
    expect(parseKbGapForm(form({ intent: 'ignore', gapId: 'abc' }))).toEqual({
      ok: false,
      code: 'bad_request',
    });
    expect(parseKbGapForm(form({ intent: 'delete', gapId: ID }))).toEqual({
      ok: false,
      code: 'bad_request',
    });
    expect(parseKbGapForm(form({}))).toEqual({ ok: false, code: 'bad_request' });
  });
});

describe('FR-134 gom nhóm theo chủ đề', () => {
  const gap = (topic: (typeof KB_GAP_TOPICS)[number], count: number, id = `${topic}${count}`) => ({
    id,
    topic,
    count,
  });

  it('FR-134 nhóm nhiều lượt hỏi nhất trước, mỗi nhóm giữ thứ tự gốc, tổng cộng đúng', () => {
    const groups = groupGapsByTopic([
      gap('shipping', 5),
      gap('size', 9),
      gap('shipping', 2, 's2'),
      gap('policy', 7),
    ]);
    expect(groups.map((g) => [g.topic, g.total])).toEqual([
      ['size', 9],
      ['shipping', 7],
      ['policy', 7],
    ]);
    expect(groups[1]?.gaps.map((g) => g.id)).toEqual(['shipping5', 's2']);
  });

  it('FR-134 danh sách rỗng → không nhóm', () => {
    expect(groupGapsByTopic([])).toEqual([]);
  });
});

describe('FR-134 chuyển dòng DB sang dữ liệu hiển thị', () => {
  it('FR-134 giữ dòng hợp lệ (ngày → ISO), bỏ dòng chủ đề/trạng thái lạ', () => {
    const row = (topic: string, status: string) => ({
      id: ID,
      topic,
      status,
      count: 3,
      sampleQuestionMasked: 'q',
      lastSeenAt: new Date('2026-11-06T00:00:00Z'),
    });
    expect(toKbGapViews([row('size', 'open'), row('zzz', 'open'), row('size', 'zzz')])).toEqual([
      {
        id: ID,
        topic: 'size',
        count: 3,
        sampleQuestionMasked: 'q',
        lastSeenAt: '2026-11-06T00:00:00.000Z',
        status: 'open',
      },
    ]);
  });
});

describe('FR-134 chuỗi giao diện kbGaps', () => {
  it('FR-134 mọi chủ đề, trạng thái và lỗi có nhãn vi và en', () => {
    for (const locale of ['vi', 'en'] as const) {
      const m = getMessages(locale).kbGaps as unknown as Record<string, Record<string, string>>;
      for (const t of KB_GAP_TOPICS) expect(m.topic?.[t], `${locale}:topic.${t}`).toBeTruthy();
      for (const s of ['open', 'resolved', 'ignored'])
        expect(m.status?.[s], `${locale}:status.${s}`).toBeTruthy();
      for (const e of ['invalid_faq', 'unavailable'])
        expect(m.error?.[e], `${locale}:error.${e}`).toBeTruthy();
    }
  });
});

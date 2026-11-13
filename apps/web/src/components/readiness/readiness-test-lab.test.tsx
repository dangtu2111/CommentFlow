import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import vi_messages from '../../../../../packages/shared/src/i18n/messages/vi.json';

vi.mock('../../app/app/(guarded)/readiness/test-lab-actions', () => ({
  addTestCasesAction: vi.fn(),
  deleteTestCaseAction: vi.fn(),
  runSavedTestsAction: vi.fn(),
}));

import { type LabCase, ReadinessTestLab } from './readiness-test-lab';

const render = (cases: LabCase[]) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={vi_messages}>
      <ReadinessTestLab cases={cases} />
    </NextIntlClientProvider>,
  );

const base: LabCase = {
  id: '11111111-1111-4111-8111-111111111111',
  question: 'ship về Hà Nội bao nhiêu',
  expectAction: 'redirect',
  replyIncludes: ['20.000đ'],
  lastStatus: null,
  lastActual: null,
  lastReply: null,
  lastFailures: [],
};

describe('ReadinessTestLab', () => {
  it('bộ trống: có neo #test-lab, ô thêm câu (name="cases"), nút chạy bị khóa, không bảng, tỷ lệ "—"', () => {
    const html = render([]);
    expect(html).toContain('id="test-lab"');
    expect(html).toContain('name="cases"');
    expect(html).toContain('Bộ câu còn trống');
    expect(html).not.toContain('<table');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Chạy lại cả bộ \(0 câu\)/);
    expect(html).toContain('—');
  });

  it('có câu: bảng kèm nhãn "Chưa chạy", từ khóa, nút xóa theo id; số liệu chỉ tính câu đã chạy', () => {
    const html = render([
      base,
      {
        ...base,
        id: '22222222-2222-4222-8222-222222222222',
        question: 'giá áo thun',
        expectAction: 'answer',
        replyIncludes: [],
        lastStatus: 'fail',
        lastActual: 'redirect',
        lastReply: 'ib shop nhé',
        lastFailures: ['action_mismatch'],
      },
    ]);
    expect(html).toContain('<table');
    expect(html).toContain('Chưa chạy');
    expect(html).toContain('Từ khóa phải có: 20.000đ');
    expect(html).toContain('name="id" value="11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('ib shop nhé');
    expect(html).toContain('Hành động khác mong đợi');
    expect(html).toContain('0%'); // 1 câu đã chạy, 0 đạt
    expect(html).toContain('Chạy lại cả bộ (2 câu)');
  });
});

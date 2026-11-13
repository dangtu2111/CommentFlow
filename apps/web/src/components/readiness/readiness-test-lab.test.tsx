import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import vi_messages from '../../../../../packages/shared/src/i18n/messages/vi.json';

vi.mock('../../app/app/(guarded)/readiness/test-lab-actions', () => ({
  runKbTestSetAction: vi.fn(),
}));

import { ReadinessTestLab } from './readiness-test-lab';

describe('ReadinessTestLab', () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={vi_messages}>
      <ReadinessTestLab />
    </NextIntlClientProvider>,
  );

  it('có biểu mẫu chạy bộ câu (trường cases), nút chạy và neo #test-lab', () => {
    expect(html).toContain('id="test-lab"');
    expect(html).toContain('name="cases"');
    expect(html).toContain('Chạy bộ câu kiểm thử');
    expect(html).toContain('Bộ câu kiểm thử hồi quy');
  });

  it('chưa chạy: báo chưa có kết quả, không có bảng/số liệu bịa; nói rõ bộ câu chưa được lưu', () => {
    expect(html).toContain('Chưa có kết quả');
    expect(html).not.toContain('<table');
    expect(html).toContain('chưa được lưu');
  });
});

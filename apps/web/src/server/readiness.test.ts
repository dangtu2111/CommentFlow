import { READINESS_REQUIRED_ITEMS, READINESS_SAMPLE_QUESTIONS } from '@flow/ai';
import { describe, expect, it } from 'vitest';
import { getMessages } from '../i18n/messages';
import { readinessLangOf } from './readiness';

type Bag = Record<string, unknown>;

describe('FR-146 trang Độ sẵn sàng của AI', () => {
  it('FR-146 ngôn ngữ đo theo ngôn ngữ giao diện, mặc định vi', () => {
    expect(readinessLangOf('en')).toBe('en');
    expect(readinessLangOf('vi')).toBe('vi');
    expect(readinessLangOf('fr')).toBe('vi');
  });

  it('FR-146 mọi mục bắt buộc, câu mẫu và chủ đề thiếu đều có chuỗi vi và en', () => {
    for (const locale of ['vi', 'en'] as const) {
      const r = getMessages(locale).readiness as unknown as Bag;
      const required = r.required as Record<string, Bag>;
      const sample = r.sample as Bag;
      const missing = r.missing as Bag;
      for (const item of READINESS_REQUIRED_ITEMS) {
        expect(required[item]?.label, `${locale}:required.${item}.label`).toBeTruthy();
        expect(required[item]?.hint, `${locale}:required.${item}.hint`).toBeTruthy();
      }
      for (const q of READINESS_SAMPLE_QUESTIONS) {
        expect(sample[q.id], `${locale}:sample.${q.id}`).toBeTruthy();
        expect(missing[q.topic], `${locale}:missing.${q.topic}`).toBeTruthy();
      }
    }
  });
});

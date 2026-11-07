import { describe, expect, it } from 'vitest';
import { llmStatusText } from './llm-status';

const t = (key: string, values?: Record<string, string>) =>
  values?.steps ? `${key}:${values.steps}` : key;

describe('llmStatusText', () => {
  it('không bước nào bật → mô phỏng', () => {
    expect(llmStatusText(t, { extractor: false, drafter: false })).toBe('llm.off');
  });
  it('liệt kê đúng các bước đang chạy AI thật', () => {
    expect(llmStatusText(t, { extractor: false, drafter: true })).toBe('llm.on:llm.drafter');
    expect(llmStatusText(t, { extractor: true, drafter: true })).toBe(
      'llm.on:llm.extractor, llm.drafter',
    );
  });
});

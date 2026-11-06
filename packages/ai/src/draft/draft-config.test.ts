import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAFT_MODEL, loadDraftConfig } from './draft-config';

describe('FR-029 cấu hình soạn trả lời bằng LLM', () => {
  it('mặc định TẮT, model mock-llm', () => {
    expect(loadDraftConfig({})).toEqual({ enabled: false, model: DEFAULT_DRAFT_MODEL });
    expect(DEFAULT_DRAFT_MODEL).toBe('mock-llm');
  });
  it('chỉ đúng chữ true mới bật', () => {
    for (const v of ['TRUE', '1', 'yes', '', ' true']) {
      expect(loadDraftConfig({ DRAFT_LLM_ENABLED: v }).enabled).toBe(false);
    }
    expect(loadDraftConfig({ DRAFT_LLM_ENABLED: 'true' }).enabled).toBe(true);
  });
  it('model tùy chọn, bỏ khoảng trắng; rỗng → mặc định', () => {
    expect(loadDraftConfig({ DRAFT_LLM_MODEL: ' claude-x ' }).model).toBe('claude-x');
    expect(loadDraftConfig({ DRAFT_LLM_MODEL: '  ' }).model).toBe('mock-llm');
  });
});

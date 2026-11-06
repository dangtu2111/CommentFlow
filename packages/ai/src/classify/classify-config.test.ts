import { describe, expect, it } from 'vitest';
import { loadClassifyConfig } from './classify-config';

describe('FR-027 cấu hình phân loại LLM (cờ TẮT mặc định)', () => {
  it('mặc định tắt, model mock-llm', () => {
    expect(loadClassifyConfig({})).toEqual({ enabled: false, model: 'mock-llm' });
  });
  it('chỉ đúng chữ "true" mới bật', () => {
    for (const v of ['TRUE', '1', 'yes', ' true', '']) {
      expect(loadClassifyConfig({ CLASSIFY_LLM_ENABLED: v }).enabled).toBe(false);
    }
    expect(loadClassifyConfig({ CLASSIFY_LLM_ENABLED: 'true' }).enabled).toBe(true);
  });
  it('đọc tên model từ CLASSIFY_LLM_MODEL, gọt khoảng trắng; rỗng → mặc định', () => {
    expect(loadClassifyConfig({ CLASSIFY_LLM_MODEL: ' small-model ' }).model).toBe('small-model');
    expect(loadClassifyConfig({ CLASSIFY_LLM_MODEL: '  ' }).model).toBe('mock-llm');
  });
});

import { describe, expect, it } from 'vitest';
import { loadClassifyConfig } from './classify/classify-config';
import { loadDraftConfig } from './draft/draft-config';
import { loadLlmStepConfig } from './llm-step-config';
import { loadRewriteConfig } from './rewrite/rewrite-config';

/** KHÔNG có model mặc định (không mock khi chạy): bật cờ mà thiếu tên model → lỗi rõ + bước TẮT, không bao giờ gọi model giả. */
const cases = [
  ['phân loại', loadClassifyConfig, 'CLASSIFY_LLM_ENABLED', 'CLASSIFY_LLM_MODEL'],
  ['soạn câu', loadDraftConfig, 'DRAFT_LLM_ENABLED', 'DRAFT_LLM_MODEL'],
  ['viết lại', loadRewriteConfig, 'REWRITE_LLM_ENABLED', 'REWRITE_LLM_MODEL'],
] as const;

describe.each(cases)('cấu hình LLM bước %s', (_name, load, flag, modelVar) => {
  it('mặc định TẮT, không có model, không lỗi', () => {
    expect(load({})).toEqual({ enabled: false, model: null, error: null });
  });

  it('chỉ đúng chữ "true" mới bật (có model)', () => {
    for (const v of ['TRUE', '1', 'yes', ' true', '']) {
      expect(load({ [flag]: v, [modelVar]: 'cf-x' }).enabled).toBe(false);
    }
    expect(load({ [flag]: 'true', [modelVar]: 'cf-x' })).toEqual({
      enabled: true,
      model: 'cf-x',
      error: null,
    });
  });

  it('gọt khoảng trắng của tên model', () => {
    expect(load({ [flag]: 'true', [modelVar]: ' cf-x ' }).model).toBe('cf-x');
  });

  it('bật cờ mà thiếu hoặc rỗng tên model → TẮT bước, `error` nêu tên biến, không có model mặc định', () => {
    for (const missing of [{}, { [modelVar]: '   ' }]) {
      const config = load({ [flag]: 'true', ...missing });
      expect(config.enabled).toBe(false);
      expect(config.model).toBeNull();
      expect(config.error).toContain(modelVar);
      expect(config.error).not.toContain('mock-llm');
    }
  });

  it('cờ tắt mà có model → không lỗi (chỉ chưa dùng)', () => {
    expect(load({ [modelVar]: 'cf-x' })).toEqual({ enabled: false, model: 'cf-x', error: null });
  });
});

describe('loadLlmStepConfig', () => {
  it('đọc đúng biến được chỉ định', () => {
    expect(loadLlmStepConfig({ A: 'true', B: 'm' }, { flag: 'A', model: 'B' }).enabled).toBe(true);
  });
});

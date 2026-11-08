import { describe, expect, it } from 'vitest';
import { loadClassifyConfig } from './classify/classify-config';
import { loadDraftConfig } from './draft/draft-config';
import { loadLlmModel } from './llm-step-config';
import { loadRewriteConfig } from './rewrite/rewrite-config';

/** Env chỉ còn TÊN MODEL; không có model mặc định, không có cờ bật trong env (cờ ở DB). */
describe.each([
  ['phân loại', loadClassifyConfig, 'CLASSIFY_LLM_MODEL'],
  ['soạn câu', loadDraftConfig, 'DRAFT_LLM_MODEL'],
  ['viết lại', loadRewriteConfig, 'REWRITE_LLM_MODEL'],
] as const)('model LLM bước %s', (_name, load, modelVar) => {
  it('thiếu hoặc rỗng → null (chưa cấu hình), không có model mặc định', () => {
    expect(load({})).toEqual({ model: null });
    expect(load({ [modelVar]: '   ' })).toEqual({ model: null });
  });

  it('đọc tên model, gọt khoảng trắng', () => {
    expect(load({ [modelVar]: ' cf-x ' })).toEqual({ model: 'cf-x' });
  });

  it('biến cờ *_LLM_ENABLED trong env KHÔNG còn tác dụng', () => {
    const flagVar = modelVar.replace('_MODEL', '_ENABLED');
    expect(load({ [flagVar]: 'true' })).toEqual({ model: null });
  });
});

describe('loadLlmModel', () => {
  it('đọc đúng biến được chỉ định', () => {
    expect(loadLlmModel({ A: 'm' }, 'A')).toBe('m');
    expect(loadLlmModel({ A: 'm' }, 'B')).toBeNull();
  });
});

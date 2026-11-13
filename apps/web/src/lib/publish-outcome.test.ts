import { describe, expect, it } from 'vitest';
import { outcomeOf } from './publish-outcome';

const t = (status: string, errorCode: string | null = null) => ({ status, errorCode });

describe('outcomeOf', () => {
  it('chưa có mục tiêu hoặc còn pending/publishing → pending', () => {
    expect(outcomeOf([])).toEqual({ state: 'pending' });
    expect(outcomeOf([t('pending')])).toEqual({ state: 'pending' });
    expect(outcomeOf([t('published'), t('publishing')])).toEqual({ state: 'pending' });
  });

  it('tất cả published → thành công', () => {
    expect(outcomeOf([t('published'), t('published')])).toEqual({ state: 'published' });
  });

  it('có lỗi chắc chắn → failed kèm mã; không rõ → unknown (ưu tiên hơn failed)', () => {
    expect(outcomeOf([t('published'), t('failed', 'missing_permission')])).toEqual({
      state: 'failed',
      errorCode: 'missing_permission',
    });
    expect(outcomeOf([t('failed', 'permission'), t('unknown', 'unknown_result')])).toEqual({
      state: 'unknown',
      errorCode: 'unknown_result',
    });
  });
});

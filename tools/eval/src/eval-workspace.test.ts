import { describe, expect, it } from 'vitest';
import { EVAL_WORKSPACE } from './eval-workspace';

describe('EVAL_WORKSPACE — MỘT workspace [EVAL] cố định cho mọi lần chạy --persist-usage', () => {
  it('id UUID cố định hợp lệ, tên có nhãn [EVAL], slug cố định (không sinh workspace mới mỗi lần chạy)', () => {
    expect(EVAL_WORKSPACE.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(EVAL_WORKSPACE.name.startsWith('[EVAL]')).toBe(true);
    expect(EVAL_WORKSPACE.slug).toBe('eval-runner');
  });
});

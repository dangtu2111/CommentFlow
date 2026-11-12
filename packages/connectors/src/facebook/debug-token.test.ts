import { describe, expect, it } from 'vitest';
import { parseDebugToken, scopesForPage } from './debug-token';

describe('parseDebugToken', () => {
  it('đọc hiệu lực, quyền đã cấp (sạch, không trùng), granular và hạn dùng', () => {
    const info = parseDebugToken({
      data: {
        is_valid: true,
        scopes: ['pages_read_engagement', 'pages_show_list', 'pages_read_engagement'],
        granular_scopes: [{ scope: 'pages_read_engagement', target_ids: ['111'] }],
        expires_at: 1_800_000_000,
      },
    });
    expect(info).toEqual({
      valid: true,
      scopes: ['pages_read_engagement', 'pages_show_list'],
      granular: [{ scope: 'pages_read_engagement', targetIds: ['111'] }],
      expiresAt: new Date(1_800_000_000 * 1000),
    });
  });

  it('expires_at = 0 → không hết hạn; thiếu scopes → rỗng; token hỏng → valid=false', () => {
    expect(parseDebugToken({ data: { is_valid: true, expires_at: 0 } })).toMatchObject({
      scopes: [],
      expiresAt: null,
    });
    expect(parseDebugToken({ data: { is_valid: false } })?.valid).toBe(false);
  });

  it('sai hình dạng → null', () => {
    expect(parseDebugToken({})).toBeNull();
    expect(parseDebugToken({ data: { is_valid: 'yes' } })).toBeNull();
    expect(parseDebugToken(null)).toBeNull();
  });
});

describe('scopesForPage', () => {
  it('chỉ giữ quyền có hiệu lực cho Page đó', () => {
    const info = parseDebugToken({
      data: {
        is_valid: true,
        scopes: ['pages_manage_metadata', 'pages_read_engagement'],
        granular_scopes: [{ scope: 'pages_manage_metadata', target_ids: ['999'] }],
      },
    });
    if (!info) throw new Error('phải đọc được');
    expect(scopesForPage(info, '111')).toEqual(['pages_read_engagement']);
    expect(scopesForPage(info, '999')).toEqual(['pages_manage_metadata', 'pages_read_engagement']);
  });
});

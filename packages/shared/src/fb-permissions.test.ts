import { describe, expect, it } from 'vitest';
import {
  evaluateFbPermissions,
  FB_PERMISSION_FEATURES,
  FB_REQUIRED_PERMISSIONS,
  grantedScopesForTarget,
} from './fb-permissions';

describe('FB_REQUIRED_PERMISSIONS', () => {
  it('mỗi quyền thuộc đúng một tính năng đã khai báo; không trùng', () => {
    const names = FB_REQUIRED_PERMISSIONS.map((p) => p.permission);
    expect(new Set(names).size).toBe(names.length);
    for (const item of FB_REQUIRED_PERMISSIONS) {
      expect(FB_PERMISSION_FEATURES).toContain(item.feature);
    }
    // Quyền tối thiểu để: đăng ký webhook, đọc bình luận, trả lời/ẩn.
    expect(names).toEqual(
      expect.arrayContaining([
        'pages_manage_metadata',
        'pages_read_engagement',
        'pages_read_user_content',
        'pages_manage_engagement',
      ]),
    );
  });
});

describe('evaluateFbPermissions', () => {
  const all = FB_REQUIRED_PERMISSIONS.map((p) => p.permission);

  it('đủ quyền → sufficient, không thiếu gì', () => {
    expect(evaluateFbPermissions([...all, 'pages_show_list'])).toEqual({
      sufficient: true,
      granted: expect.arrayContaining(all),
      missing: [],
      missingFeatures: [],
    });
  });

  it('thiếu quyền → liệt kê quyền thiếu và tính năng bị ảnh hưởng (không trùng)', () => {
    const r = evaluateFbPermissions(['pages_read_engagement', 'pages_read_user_content']);
    expect(r.sufficient).toBe(false);
    expect(r.missing.sort()).toEqual(['pages_manage_engagement', 'pages_manage_metadata']);
    expect(r.missingFeatures.sort()).toEqual(['reply', 'webhook']);
  });

  it('không có gì → thiếu hết; giá trị lạ/trùng/rỗng bị bỏ khỏi danh sách đã cấp', () => {
    const r = evaluateFbPermissions(['', 'pages_read_engagement', 'pages_read_engagement', 'foo']);
    expect(r.granted).toEqual(['foo', 'pages_read_engagement']);
    expect(r.missing).toHaveLength(all.length - 1);
    expect(evaluateFbPermissions([]).missing.sort()).toEqual([...all].sort());
  });
});

describe('grantedScopesForTarget — quyền áp cho MỘT Page (granular scopes)', () => {
  it('quyền có danh sách mục tiêu: chỉ tính khi Page nằm trong đó; quyền không có danh sách: tính cho mọi Page', () => {
    const scopes = ['pages_read_engagement', 'pages_manage_metadata', 'pages_show_list'];
    const granular = [
      { scope: 'pages_read_engagement', target_ids: ['111', '222'] },
      { scope: 'pages_manage_metadata', target_ids: ['999'] },
    ];
    expect(grantedScopesForTarget(scopes, granular, '111').sort()).toEqual([
      'pages_read_engagement',
      'pages_show_list',
    ]);
    expect(grantedScopesForTarget(scopes, granular, '999').sort()).toEqual([
      'pages_manage_metadata',
      'pages_show_list',
    ]);
  });

  it('không có granular → trả nguyên danh sách quyền', () => {
    expect(grantedScopesForTarget(['a', 'b'], undefined, '1')).toEqual(['a', 'b']);
    expect(grantedScopesForTarget(['a'], [], '1')).toEqual(['a']);
  });
});

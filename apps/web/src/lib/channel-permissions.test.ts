import { FB_REQUIRED_PERMISSIONS } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { channelPermissionView } from './channel-permissions';

const all = FB_REQUIRED_PERMISSIONS.map((p) => p.permission);
const base = {
  platform: 'facebook' as const,
  status: 'connected' as const,
  lastCheckedAt: new Date('2026-11-12T00:00:00Z'),
  scopes: [...all, 'pages_show_list'],
};

describe('channelPermissionView', () => {
  it('đủ quyền → ok, không thiếu gì', () => {
    const v = channelPermissionView(base);
    expect(v.state).toBe('ok');
    expect(v.missing).toEqual([]);
    expect(v.items.every((item) => item.granted)).toBe(true);
    expect(v.items.map((item) => item.permission)).toEqual(all);
  });

  it('thiếu quyền → missing, nêu quyền thiếu + tính năng ảnh hưởng, từng mục đánh dấu đúng', () => {
    const v = channelPermissionView({ ...base, scopes: ['pages_read_engagement'] });
    expect(v.state).toBe('missing');
    expect(v.missing).toEqual([
      'pages_manage_metadata',
      'pages_read_user_content',
      'pages_manage_engagement',
    ]);
    expect(v.missingFeatures.sort()).toEqual(['read', 'reply', 'webhook']);
    expect(v.items.find((i) => i.permission === 'pages_read_engagement')?.granted).toBe(true);
    expect(v.items.find((i) => i.permission === 'pages_manage_engagement')?.granted).toBe(false);
  });

  it('chưa từng kiểm → unknown (danh sách quyền lưu lúc kết nối chưa đáng tin để kết luận thiếu)', () => {
    expect(channelPermissionView({ ...base, lastCheckedAt: null, scopes: [] }).state).toBe(
      'unknown',
    );
  });

  it('kênh không phải Facebook hoặc không còn kết nối → unknown (không kết luận)', () => {
    expect(channelPermissionView({ ...base, platform: 'instagram' }).state).toBe('unknown');
    expect(channelPermissionView({ ...base, status: 'expired' }).state).toBe('unknown');
    expect(channelPermissionView({ ...base, status: 'revoked' }).state).toBe('unknown');
  });
});

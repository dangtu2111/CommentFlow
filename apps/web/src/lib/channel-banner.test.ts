import { describe, expect, it } from 'vitest';
import { buildBannerModel, type ChannelAlertInput } from './channel-banner';

const alert = (name: string, status: ChannelAlertInput['status']): ChannelAlertInput => ({
  id: name,
  name,
  platform: 'facebook',
  status,
});

describe('FR-012 buildBannerModel — banner trạng thái kênh', () => {
  it('FR-012 không có kênh lỗi → không banner', () => {
    expect(buildBannerModel([], 'owner')).toEqual([]);
  });

  it('FR-012 gom theo trạng thái, thứ tự expired → revoked → error; Owner/Staff khác hướng dẫn', () => {
    const alerts = [alert('C', 'error'), alert('A', 'revoked'), alert('B', 'expired')];
    const owner = buildBannerModel(alerts, 'owner');
    expect(owner.map((b) => [b.status, b.names, b.moreCount, b.audience])).toEqual([
      ['expired', ['B'], 0, 'owner'],
      ['revoked', ['A'], 0, 'owner'],
      ['error', ['C'], 0, 'owner'],
    ]);
    expect(buildBannerModel(alerts, 'staff').every((b) => b.audience === 'staff')).toBe(true);
  });

  it('FR-012 tối đa 3 tên kênh mỗi banner + số kênh còn lại; giữ thứ tự đầu vào', () => {
    const alerts = ['K1', 'K2', 'K3', 'K4', 'K5'].map((n) => alert(n, 'expired'));
    const [banner] = buildBannerModel(alerts, 'owner');
    expect(banner?.names).toEqual(['K1', 'K2', 'K3']);
    expect(banner?.moreCount).toBe(2);
  });

  it('FR-012 chỉ expired/revoked là khẩn cấp (role alert); error là thông báo (status)', () => {
    const banners = buildBannerModel(
      [alert('A', 'expired'), alert('B', 'revoked'), alert('C', 'error')],
      'owner',
    );
    expect(banners.map((b) => [b.status, b.urgent])).toEqual([
      ['expired', true],
      ['revoked', true],
      ['error', false],
    ]);
  });

  it('FR-012 trạng thái lạ bị bỏ qua (không làm hỏng banner)', () => {
    const odd = { ...alert('X', 'expired'), status: 'ghost' } as unknown as ChannelAlertInput;
    expect(buildBannerModel([odd], 'owner')).toEqual([]);
  });
});

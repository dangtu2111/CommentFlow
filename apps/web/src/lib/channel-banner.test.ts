import { describe, expect, it } from 'vitest';
import {
  buildBannerModel,
  buildWebhookSilentBanner,
  type ChannelAlertInput,
  MAX_BANNER_NAMES,
} from './channel-banner';

describe('FR-023 buildWebhookSilentBanner — cảnh báo webhook im lặng', () => {
  const ch = (name: string) => ({ id: name, name });

  it('FR-023 không có kênh im lặng → không banner', () => {
    expect(buildWebhookSilentBanner([], 'owner')).toBeNull();
  });

  it('FR-023 chỉ Owner thấy (nội dung webhook chỉ Owner đọc được); Staff → không banner', () => {
    expect(buildWebhookSilentBanner([ch('A')], 'staff')).toBeNull();
    expect(buildWebhookSilentBanner([ch('A')], 'owner')).toMatchObject({
      names: ['A'],
      moreCount: 0,
    });
  });

  it('FR-023 tối đa 3 tên + số còn lại, giữ thứ tự', () => {
    const banner = buildWebhookSilentBanner(['K1', 'K2', 'K3', 'K4', 'K5'].map(ch), 'owner');
    expect(MAX_BANNER_NAMES).toBe(3);
    expect(banner?.names).toEqual(['K1', 'K2', 'K3']);
    expect(banner?.moreCount).toBe(2);
  });
});

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

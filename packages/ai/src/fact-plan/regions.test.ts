import { describe, expect, it } from 'vitest';
import { canonicalProvince, findProvinces, PROVINCES, sameProvince } from './regions';

describe('từ điển tỉnh/thành (sau sáp nhập 2025, kèm tên cũ)', () => {
  it('có đúng 34 đơn vị cấp tỉnh sau sáp nhập', () => {
    expect(PROVINCES).toHaveLength(34);
    expect(new Set(PROVINCES.map((p) => p.id)).size).toBe(34);
  });

  it('tên MỚI và tên CŨ cùng quy về một tỉnh/thành mới', () => {
    expect(canonicalProvince('Bình Dương')).toBe('ho_chi_minh');
    expect(canonicalProvince('Bà Rịa - Vũng Tàu')).toBe('ho_chi_minh');
    expect(canonicalProvince('Sài Gòn')).toBe('ho_chi_minh');
    expect(canonicalProvince('TP.HCM')).toBe('ho_chi_minh');
    expect(canonicalProvince('Hải Dương')).toBe('hai_phong');
    expect(canonicalProvince('Quảng Nam')).toBe('da_nang');
    expect(canonicalProvince('Hà Giang')).toBe('tuyen_quang');
    expect(canonicalProvince('Hà Nội')).toBe('ha_noi');
    expect(canonicalProvince('HN')).toBe('ha_noi');
  });

  it('không dấu, hoa/thường, dấu câu đều nhận', () => {
    expect(canonicalProvince('ha noi')).toBe('ha_noi');
    expect(canonicalProvince('DA NANG')).toBe('da_nang');
    expect(canonicalProvince('thanh pho ho chi minh')).toBe('ho_chi_minh');
    expect(canonicalProvince('vung tau')).toBe('ho_chi_minh');
  });

  it('tên không phải địa danh → null; từ ngắn không khớp nhầm giữa từ khác', () => {
    expect(canonicalProvince('áo thun')).toBeNull();
    expect(canonicalProvince('')).toBeNull();
    expect(findProvinces('shnow')).toEqual([]); // "hn" chỉ khớp khi đứng riêng
    expect(findProvinces('hanoi')).toEqual(['ha_noi']); // cách viết liền thường gặp
    expect(findProvinces('chan phan')).toEqual([]);
  });

  it('câu có nhiều tỉnh khác nhau → trả đủ (nơi gọi quyết định mơ hồ); trùng tỉnh sau quy đổi chỉ tính một', () => {
    expect(findProvinces('ship từ Hà Nội vào Đà Nẵng')).toEqual(['ha_noi', 'da_nang']);
    expect(findProvinces('Bình Dương hay TPHCM đều được')).toEqual(['ho_chi_minh']);
  });

  it('sameProvince so theo tỉnh mới (tên cũ khai ở dòng ship vẫn khớp khách nói tên mới)', () => {
    expect(sameProvince('Bình Dương', 'TP HCM')).toBe(true);
    expect(sameProvince('Hà Nội', 'Hải Phòng')).toBe(false);
    expect(sameProvince('abc', 'Hà Nội')).toBe(false);
  });
});

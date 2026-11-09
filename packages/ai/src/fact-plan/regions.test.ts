import { describe, expect, it } from 'vitest';
import { canonicalProvince, findProvinces, PROVINCES, sameProvince } from './regions';

describe('bí danh và thành phố thuộc tỉnh (đã duyệt 08/11/2026)', () => {
  it.each([
    ['SG', 'ho_chi_minh'],
    ['Thủ Đức', 'ho_chi_minh'],
    ['HP', 'hai_phong'],
    ['Biên Hòa', 'dong_nai'],
    ['Hạ Long', 'quang_ninh'],
    ['Quy Nhơn', 'gia_lai'],
    ['Buôn Ma Thuột', 'dak_lak'],
    ['Hội An', 'da_nang'],
    ['Tam Kỳ', 'da_nang'],
    ['Tuy Hòa', 'dak_lak'],
    ['Phan Thiết', 'lam_dong'],
    ['Rạch Giá', 'an_giang'],
    ['Mỹ Tho', 'dong_thap'],
    ['Long Xuyên', 'an_giang'],
    ['Bảo Lộc', 'lam_dong'],
  ])('%s → %s', (name, id) => {
    expect(canonicalProvince(name)).toBe(id);
  });

  it('viết tắt 2 chữ (HN/HP/SG) chỉ nhận khi đứng sau từ chỉ nơi hoặc khi cả câu ≤ 3 từ: "máy in HP" không phải Hải Phòng', () => {
    expect(findProvinces('máy in HP loại tốt')).toEqual([]);
    expect(findProvinces('laptop HP 15 còn hàng không')).toEqual([]);
    expect(findProvinces('ship ra HP bao nhiêu')).toEqual(['hai_phong']);
    expect(findProvinces('giao về SG nhé bạn')).toEqual(['ho_chi_minh']);
    expect(findProvinces('HP')).toEqual(['hai_phong']);
    expect(findProvinces('ở HN ạ')).toEqual(['ha_noi']);
    expect(findProvinces('mình ở hn nhé')).toEqual(['ha_noi']);
    expect(findProvinces('hn')).toEqual(['ha_noi']);
  });

  it('KHÔNG có "ĐN" (Đà Nẵng/Đồng Nai mơ hồ)', () => {
    expect(canonicalProvince('ĐN')).toBeNull();
    expect(canonicalProvince('dn')).toBeNull();
  });

  it('"Vinh" là Nghệ An, nhưng Vĩnh Long / Vĩnh Phúc / Vĩnh Yên KHÔNG ra Nghệ An', () => {
    expect(canonicalProvince('Vinh')).toBe('nghe_an');
    expect(canonicalProvince('ship ra TP Vinh nhé')).toBe('nghe_an');
    expect(canonicalProvince('Vĩnh Long')).toBe('vinh_long');
    expect(findProvinces('Vĩnh Long')).toEqual(['vinh_long']);
    expect(findProvinces('vinh long')).toEqual(['vinh_long']);
    expect(findProvinces('Vĩnh Phúc')).toEqual(['phu_tho']);
    expect(findProvinces('vinh phuc')).toEqual(['phu_tho']);
    expect(findProvinces('Vĩnh Yên')).toEqual(['phu_tho']);
    expect(findProvinces('từ Vinh vào Vĩnh Long')).toEqual(['nghe_an', 'vinh_long']);
  });
});

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

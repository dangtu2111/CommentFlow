import { foldText } from '@flow/shared';

/**
 * Từ điển tỉnh/thành Việt Nam SAU sáp nhập 2025 (34 đơn vị cấp tỉnh), kèm TÊN CŨ của các tỉnh đã gộp và vài cách gọi thường gặp. Dùng để so địa điểm khách nêu với
 * dòng khu vực ship của shop (DRAFT-FACT-SLOTS): hai tên là cùng một nơi nếu quy về cùng một tỉnh/thành MỚI. KHÔNG đoán: tên không có trong từ điển → không khớp.
 * Danh sách theo nghị quyết sáp nhập 2025; chủ dự án kiểm lại khi có thay đổi hành chính.
 */
export type Province = { id: string; names: string[] };

export const PROVINCES: readonly Province[] = [
  { id: 'ha_noi', names: ['Hà Nội', 'Hanoi', 'HN', 'Thủ đô'] },
  { id: 'hue', names: ['Huế', 'Thừa Thiên Huế', 'Thừa Thiên - Huế'] },
  { id: 'lai_chau', names: ['Lai Châu'] },
  { id: 'dien_bien', names: ['Điện Biên'] },
  { id: 'son_la', names: ['Sơn La'] },
  { id: 'lang_son', names: ['Lạng Sơn'] },
  { id: 'quang_ninh', names: ['Quảng Ninh'] },
  { id: 'thanh_hoa', names: ['Thanh Hóa'] },
  { id: 'nghe_an', names: ['Nghệ An'] },
  { id: 'ha_tinh', names: ['Hà Tĩnh'] },
  { id: 'cao_bang', names: ['Cao Bằng'] },
  { id: 'tuyen_quang', names: ['Tuyên Quang', 'Hà Giang'] },
  { id: 'lao_cai', names: ['Lào Cai', 'Yên Bái'] },
  { id: 'thai_nguyen', names: ['Thái Nguyên', 'Bắc Kạn'] },
  { id: 'phu_tho', names: ['Phú Thọ', 'Vĩnh Phúc', 'Hòa Bình'] },
  { id: 'bac_ninh', names: ['Bắc Ninh', 'Bắc Giang'] },
  { id: 'hung_yen', names: ['Hưng Yên', 'Thái Bình'] },
  { id: 'hai_phong', names: ['Hải Phòng', 'Hải Dương'] },
  { id: 'ninh_binh', names: ['Ninh Bình', 'Hà Nam', 'Nam Định'] },
  { id: 'quang_tri', names: ['Quảng Trị', 'Quảng Bình'] },
  { id: 'da_nang', names: ['Đà Nẵng', 'Quảng Nam'] },
  { id: 'quang_ngai', names: ['Quảng Ngãi', 'Kon Tum'] },
  { id: 'gia_lai', names: ['Gia Lai', 'Bình Định'] },
  { id: 'khanh_hoa', names: ['Khánh Hòa', 'Ninh Thuận', 'Nha Trang'] },
  { id: 'lam_dong', names: ['Lâm Đồng', 'Đắk Nông', 'Bình Thuận', 'Đà Lạt'] },
  { id: 'dak_lak', names: ['Đắk Lắk', 'Phú Yên'] },
  {
    id: 'ho_chi_minh',
    names: [
      'Hồ Chí Minh',
      'TP Hồ Chí Minh',
      'Thành phố Hồ Chí Minh',
      'TPHCM',
      'HCM',
      'Sài Gòn',
      'Saigon',
      'Bình Dương',
      'Bà Rịa Vũng Tàu',
      'Vũng Tàu',
    ],
  },
  { id: 'dong_nai', names: ['Đồng Nai', 'Bình Phước'] },
  { id: 'tay_ninh', names: ['Tây Ninh', 'Long An'] },
  { id: 'can_tho', names: ['Cần Thơ', 'Sóc Trăng', 'Hậu Giang'] },
  { id: 'vinh_long', names: ['Vĩnh Long', 'Bến Tre', 'Trà Vinh'] },
  { id: 'dong_thap', names: ['Đồng Tháp', 'Tiền Giang'] },
  { id: 'ca_mau', names: ['Cà Mau', 'Bạc Liêu'] },
  { id: 'an_giang', names: ['An Giang', 'Kiên Giang', 'Phú Quốc'] },
];

/** Chuẩn hóa để so: bỏ dấu, chữ thường, mọi ký tự không phải chữ-số thành khoảng trắng. */
const norm = (text: string): string =>
  foldText(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const TERMS: ReadonlyArray<{ id: string; pattern: RegExp }> = PROVINCES.flatMap((province) =>
  province.names.map((name) => ({
    id: province.id,
    pattern: new RegExp(`(?<![a-z0-9])${norm(name).replace(/ /g, ' ')}(?![a-z0-9])`),
  })),
);

/** Mọi tỉnh/thành (đã quy về tên mới, không trùng, theo thứ tự xuất hiện trong từ điển câu) được nhắc trong văn bản. */
export function findProvinces(text: string): string[] {
  const padded = ` ${norm(text)} `;
  const hits: Array<{ id: string; at: number }> = [];
  for (const term of TERMS) {
    const at = padded.search(term.pattern);
    if (at >= 0 && !hits.some((hit) => hit.id === term.id)) hits.push({ id: term.id, at });
  }
  return hits.sort((a, b) => a.at - b.at).map((hit) => hit.id);
}

/** Tỉnh/thành mới của MỘT tên địa điểm; không nhận ra hoặc nêu nhiều nơi → `null`. */
export function canonicalProvince(text: string): string | null {
  const found = findProvinces(text);
  return found.length === 1 ? (found[0] as string) : null;
}

/** Hai tên có cùng tỉnh/thành mới (tên cũ ↔ tên mới sau sáp nhập) không. */
export function sameProvince(a: string, b: string): boolean {
  const left = canonicalProvince(a);
  return left !== null && left === canonicalProvince(b);
}

import { foldText } from '@flow/shared';

/**
 * Từ điển tỉnh/thành Việt Nam SAU sáp nhập 2025 (34 đơn vị cấp tỉnh), kèm TÊN CŨ của các tỉnh đã gộp và vài cách gọi thường gặp. Dùng để so địa điểm khách nêu với
 * dòng khu vực ship của shop (DRAFT-FACT-SLOTS): hai tên là cùng một nơi nếu quy về cùng một tỉnh/thành MỚI. KHÔNG đoán: tên không có trong từ điển → không khớp.
 * NGUỒN ĐỐI CHIẾU: Nghị quyết 202/2025/QH15 (Quốc hội, 12/06/2025) về sắp xếp đơn vị hành chính cấp tỉnh — 34 đơn vị (11 giữ nguyên + 23 hợp nhất); chủ dự án đã soát khớp danh sách chính thức
 * (08/11/2026). Bí danh và thành phố/thị xã thuộc tỉnh đã được chủ dự án duyệt thêm; KHÔNG thêm "ĐN" (Đà Nẵng/Đồng Nai mơ hồ). Khi có thay đổi hành chính mới, kiểm lại theo văn bản gốc.
 */
export type Province = {
  id: string;
  names: string[];
  /** Mẫu regex (trên văn bản đã bỏ dấu, chữ thường) cho tên cần điều kiện loại trừ, vd "vinh" không đi kèm "long/phuc/yen". Ranh giới từ được thêm tự động. */
  patterns?: string[];
  /** Viết tắt 2 chữ (HN, HP, SG) dễ trùng từ khác (HP = hãng máy in/mã lực): chỉ nhận khi đứng ngay sau từ chỉ nơi (ra/về/tới/ship/to/in…) hoặc khi cả câu ≤ 3 từ (khách trả lời cụt "HN"). */
  shortNames?: string[];
};

export const PROVINCES: readonly Province[] = [
  { id: 'ha_noi', names: ['Hà Nội', 'Hanoi', 'Thủ đô'], shortNames: ['HN'] },
  { id: 'hue', names: ['Huế', 'Thừa Thiên Huế', 'Thừa Thiên - Huế'] },
  { id: 'lai_chau', names: ['Lai Châu'] },
  { id: 'dien_bien', names: ['Điện Biên'] },
  { id: 'son_la', names: ['Sơn La'] },
  { id: 'lang_son', names: ['Lạng Sơn'] },
  { id: 'quang_ninh', names: ['Quảng Ninh', 'Hạ Long'] },
  { id: 'thanh_hoa', names: ['Thanh Hóa'] },
  // "Vinh" (TP Vinh) CHỈ khi không đi kèm long/phuc/yen (Vĩnh Long, Vĩnh Phúc, Vĩnh Yên là tỉnh/thành khác sau khi bỏ dấu).
  { id: 'nghe_an', names: ['Nghệ An'], patterns: ['vinh(?! (?:long|phuc|yen))'] },
  { id: 'ha_tinh', names: ['Hà Tĩnh'] },
  { id: 'cao_bang', names: ['Cao Bằng'] },
  { id: 'tuyen_quang', names: ['Tuyên Quang', 'Hà Giang'] },
  { id: 'lao_cai', names: ['Lào Cai', 'Yên Bái'] },
  { id: 'thai_nguyen', names: ['Thái Nguyên', 'Bắc Kạn'] },
  { id: 'phu_tho', names: ['Phú Thọ', 'Vĩnh Phúc', 'Vĩnh Yên', 'Hòa Bình'] },
  { id: 'bac_ninh', names: ['Bắc Ninh', 'Bắc Giang'] },
  { id: 'hung_yen', names: ['Hưng Yên', 'Thái Bình'] },
  { id: 'hai_phong', names: ['Hải Phòng', 'Hải Dương'], shortNames: ['HP'] },
  { id: 'ninh_binh', names: ['Ninh Bình', 'Hà Nam', 'Nam Định'] },
  { id: 'quang_tri', names: ['Quảng Trị', 'Quảng Bình'] },
  { id: 'da_nang', names: ['Đà Nẵng', 'Quảng Nam', 'Hội An', 'Tam Kỳ'] },
  { id: 'quang_ngai', names: ['Quảng Ngãi', 'Kon Tum'] },
  { id: 'gia_lai', names: ['Gia Lai', 'Bình Định', 'Quy Nhơn'] },
  { id: 'khanh_hoa', names: ['Khánh Hòa', 'Ninh Thuận', 'Nha Trang'] },
  {
    id: 'lam_dong',
    names: ['Lâm Đồng', 'Đắk Nông', 'Bình Thuận', 'Đà Lạt', 'Phan Thiết', 'Bảo Lộc'],
  },
  { id: 'dak_lak', names: ['Đắk Lắk', 'Phú Yên', 'Buôn Ma Thuột', 'Tuy Hòa'] },
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
      'Thủ Đức',
    ],
    shortNames: ['SG'],
  },
  { id: 'dong_nai', names: ['Đồng Nai', 'Bình Phước', 'Biên Hòa'] },
  { id: 'tay_ninh', names: ['Tây Ninh', 'Long An'] },
  { id: 'can_tho', names: ['Cần Thơ', 'Sóc Trăng', 'Hậu Giang'] },
  { id: 'vinh_long', names: ['Vĩnh Long', 'Bến Tre', 'Trà Vinh'] },
  { id: 'dong_thap', names: ['Đồng Tháp', 'Tiền Giang', 'Mỹ Tho'] },
  { id: 'ca_mau', names: ['Cà Mau', 'Bạc Liêu'] },
  { id: 'an_giang', names: ['An Giang', 'Kiên Giang', 'Phú Quốc', 'Rạch Giá', 'Long Xuyên'] },
];

/** Chuẩn hóa để so: bỏ dấu, chữ thường, mọi ký tự không phải chữ-số thành khoảng trắng. */
const norm = (text: string): string =>
  foldText(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const bounded = (source: string) => new RegExp(`(?<![a-z0-9])${source}(?![a-z0-9])`);
/** Từ chỉ nơi đứng ngay trước viết tắt 2 chữ (đã bỏ dấu). */
const LOCATORS = 'ra|vao|ve|toi|den|o|tai|di|gui|giao|ship|sang|qua|to|at|from|tu|near'; // không có "in": "máy in HP" (in = print)
const TERMS: ReadonlyArray<{ id: string; pattern: RegExp; short: boolean }> = PROVINCES.flatMap(
  (province) => [
    ...province.names.map((name) => ({
      id: province.id,
      pattern: bounded(norm(name)),
      short: false,
    })),
    ...(province.patterns ?? []).map((source) => ({
      id: province.id,
      pattern: bounded(source),
      short: false,
    })),
    ...(province.shortNames ?? []).map((name) => ({
      id: province.id,
      pattern: bounded(`(?:(?:${LOCATORS}) +)?${norm(name)}`),
      short: true,
    })),
  ],
);

function shortAt(padded: string, pattern: RegExp, shortSentence: boolean): number {
  const match = pattern.exec(padded);
  if (match === null) return -1;
  const hasLocator = match[0].trim().includes(' ');
  return hasLocator || shortSentence ? match.index : -1;
}

/** Mọi tỉnh/thành (đã quy về tên mới, không trùng, theo thứ tự xuất hiện trong từ điển câu) được nhắc trong văn bản. */
export function findProvinces(text: string): string[] {
  const normalized = norm(text);
  const padded = ` ${normalized} `;
  const shortSentence = normalized.split(' ').length <= 3;
  const hits: Array<{ id: string; at: number }> = [];
  for (const term of TERMS) {
    // Viết tắt 2 chữ chỉ tính khi có từ chỉ nơi đứng trước, hoặc cả câu ≤ 3 từ.
    const at = term.short
      ? shortAt(padded, term.pattern, shortSentence)
      : padded.search(term.pattern);
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

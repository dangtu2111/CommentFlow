/**
 * Bố cục lưới ảnh của bài đăng Facebook (bản xem trước ở Biên tập bài viết). THUẦN, không phụ thuộc React.
 *
 * Facebook chọn bố cục theo SỐ ẢNH và HƯỚNG của ảnh (rộng / vuông / dọc), chủ yếu của ảnh đầu tiên:
 *  - 1 ảnh: nguyên chiều rộng, giữ tỉ lệ gốc; ảnh dọc quá cao bị cắt về 4:5, ảnh ngang quá dài giữ tối đa 3:1.
 *  - 2 ảnh: cả hai ngang → xếp TRÊN/DƯỚI; còn lại → xếp cạnh nhau (cả hai dọc thì ô cao 2:3, ngược lại ô vuông).
 *  - 3 ảnh: ảnh đầu ngang → 1 ô lớn phía trên + 2 ô vuông bên dưới; ảnh đầu dọc/vuông → 1 ô lớn bên trái + 2 ô xếp dọc bên phải.
 *  - 4 ảnh: ảnh đầu ngang → 1 ô lớn trên + 3 ô dưới; ảnh đầu dọc → 1 ô lớn trái + 3 ô xếp dọc phải; ảnh đầu vuông → lưới 2×2.
 *  - 5 ảnh trở lên: 2 ô trên + 3 ô dưới, ô cuối ghi "+N" cho ảnh còn lại.
 * Đây là mô phỏng theo quan sát giao diện Facebook (Meta không công bố quy tắc chính thức): sai khác nhỏ về điểm cắt là bình thường.
 */
export type FbCell = {
  /** Chỉ số ảnh trong danh sách. */
  index: number;
  /** `grid-column` / `grid-row` CSS. */
  column: string;
  row: string;
};

export type FbLayout = {
  /** Tỉ lệ rộng/cao của TOÀN khối. */
  aspect: number;
  /** `grid-template-columns` / `grid-template-rows`. */
  columns: string;
  rows: string;
  cells: FbCell[];
  /** Số ảnh dư không có ô (hiện "+N" ở ô cuối). */
  extra: number;
};

export type Orientation = 'wide' | 'tall' | 'square';

const WIDE_FROM = 1.2;
const TALL_UNTIL = 0.83;
const SINGLE_MIN = 0.8; // 4:5
const SINGLE_MAX = 3; // 3:1

export function orientationOf(ratio: number): Orientation {
  if (!Number.isFinite(ratio) || ratio <= 0) return 'square';
  if (ratio >= WIDE_FROM) return 'wide';
  if (ratio <= TALL_UNTIL) return 'tall';
  return 'square';
}

const cell = (index: number, column: string, row: string): FbCell => ({ index, column, row });

/** `ratios`: tỉ lệ rộng/cao của từng ảnh (chưa biết → 1). */
export function facebookLayout(ratios: readonly number[]): FbLayout {
  const count = ratios.length;
  const first = orientationOf(ratios[0] ?? 1);
  if (count <= 1) {
    const r = ratios[0] ?? 1;
    const safe = Number.isFinite(r) && r > 0 ? r : 1;
    return {
      aspect: Math.min(SINGLE_MAX, Math.max(SINGLE_MIN, safe)),
      columns: '1fr',
      rows: '1fr',
      cells: [cell(0, '1', '1')],
      extra: 0,
    };
  }
  if (count === 2) {
    const both = ratios.slice(0, 2).map(orientationOf);
    if (both[0] === 'wide' && both[1] === 'wide') {
      return {
        aspect: 16 / 18,
        columns: '1fr',
        rows: '1fr 1fr',
        cells: [cell(0, '1', '1'), cell(1, '1', '2')],
        extra: 0,
      };
    }
    const tall = both[0] === 'tall' && both[1] === 'tall';
    return {
      aspect: tall ? 4 / 3 : 2,
      columns: '1fr 1fr',
      rows: '1fr',
      cells: [cell(0, '1', '1'), cell(1, '2', '1')],
      extra: 0,
    };
  }
  if (count === 3) {
    if (first === 'wide') {
      return {
        aspect: 6 / 7,
        columns: '1fr 1fr',
        rows: '4fr 3fr',
        cells: [cell(0, '1 / 3', '1'), cell(1, '1', '2'), cell(2, '2', '2')],
        extra: 0,
      };
    }
    return {
      aspect: 1,
      columns: '2fr 1fr',
      rows: '1fr 1fr',
      cells: [cell(0, '1', '1 / 3'), cell(1, '2', '1'), cell(2, '2', '2')],
      extra: 0,
    };
  }
  if (count === 4) {
    if (first === 'wide') {
      return {
        aspect: 1,
        columns: '1fr 1fr 1fr',
        rows: '2fr 1fr',
        cells: [cell(0, '1 / 4', '1'), cell(1, '1', '2'), cell(2, '2', '2'), cell(3, '3', '2')],
        extra: 0,
      };
    }
    if (first === 'tall') {
      return {
        aspect: 1,
        columns: '2fr 1fr',
        rows: '1fr 1fr 1fr',
        cells: [cell(0, '1', '1 / 4'), cell(1, '2', '1'), cell(2, '2', '2'), cell(3, '2', '3')],
        extra: 0,
      };
    }
    return {
      aspect: 1,
      columns: '1fr 1fr',
      rows: '1fr 1fr',
      cells: [cell(0, '1', '1'), cell(1, '2', '1'), cell(2, '1', '2'), cell(3, '2', '2')],
      extra: 0,
    };
  }
  return {
    aspect: 1.2,
    columns: 'repeat(6, 1fr)',
    rows: '3fr 2fr',
    cells: [
      cell(0, '1 / 4', '1'),
      cell(1, '4 / 7', '1'),
      cell(2, '1 / 3', '2'),
      cell(3, '3 / 5', '2'),
      cell(4, '5 / 7', '2'),
    ],
    extra: count - 5,
  };
}

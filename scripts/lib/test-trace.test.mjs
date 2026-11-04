import { describe, expect, it } from 'vitest';
import {
  compareTrace,
  extractFrCodes,
  frCodesInTestTitles,
  parseDoneFrCodes,
} from './test-trace.mjs';

describe('extractFrCodes', () => {
  it('lấy mã đơn, khoảng (gạch ngang dài/ngắn) và danh sách rút gọn', () => {
    expect(extractFrCodes('FR-034 (lớp bọc)')).toEqual(['FR-034']);
    expect(extractFrCodes('(FR-001–005 phần lõi)')).toEqual([
      'FR-001',
      'FR-002',
      'FR-003',
      'FR-004',
      'FR-005',
    ]);
    expect(extractFrCodes('FR-002-004')).toEqual(['FR-002', 'FR-003', 'FR-004']);
    expect(extractFrCodes('(FR-001, 119)')).toEqual(['FR-001', 'FR-119']);
    expect(extractFrCodes('FR-092 bảng, FR-117 bảng, FR-118')).toEqual([
      'FR-092',
      'FR-117',
      'FR-118',
    ]);
  });

  it('không có mã → rỗng; không trùng; không nhận số 4 chữ số', () => {
    expect(extractFrCodes('không có')).toEqual([]);
    expect(extractFrCodes('FR-034 và FR-034')).toEqual(['FR-034']);
    expect(extractFrCodes('FR-1234')).toEqual([]);
  });
});

describe('parseDoneFrCodes', () => {
  const table = [
    '| Mã | Yêu cầu | Trạng thái | Bằng chứng | Việc | Ước lượng | GĐ | Nhánh |',
    '|---|---|---|---|---|---|---|---|',
    '| A | Khung FR-034 | ✅ Xong | x | — | | 0 | n |',
    '| B | FR-010 chưa làm | Thiếu | x | — | | 1 | n |',
    '| C | FR-001–002 | ✅ Xong (trừ UI) | x | — | | 0 | n |',
    '| D | Không có mã | ✅ Xong | x | — | | 0 | n |',
    '| E | FR-020 (bằng chứng ghi FR-099 ở cột khác) | Một phần | FR-099 | — | | 1 | n |',
  ].join('\n');

  it('chỉ lấy mã FR ở cột "Yêu cầu" của dòng có trạng thái bắt đầu bằng ✅', () => {
    const rows = parseDoneFrCodes(table);
    expect(rows).toEqual([
      { id: 'A', codes: ['FR-034'] },
      { id: 'C', codes: ['FR-001', 'FR-002'] },
    ]);
  });

  it('bỏ qua dòng tiêu đề, dòng ngăn cách và dòng không đủ 8 cột', () => {
    expect(parseDoneFrCodes('| a | b |\n|---|---|\ntext')).toEqual([]);
  });
});

describe('frCodesInTestTitles', () => {
  it('chỉ nhận mã nằm trong tiêu đề describe/it/test (cả .skip/.each/.only, 3 kiểu nháy)', () => {
    const src = [
      "describe('FR-034 ghi ai_usage', () => {",
      '  it("US-001 FR-001 đăng ký", () => {});',
      '  test.skip(`FR-005 chuyển workspace`, () => {});',
      "  it.each([1])('FR-117 flag %i', () => {});",
      '  // FR-999 chỉ nằm trong chú thích',
      "  const x = 'FR-998';",
      '});',
    ].join('\n');
    expect([...frCodesInTestTitles(src)].sort()).toEqual(['FR-001', 'FR-005', 'FR-034', 'FR-117']);
  });

  it('tiêu đề có khoảng mã (FR-001–003) tính cả ba mã', () => {
    expect([...frCodesInTestTitles("it('FR-001–003 luồng đăng nhập', () => {})")].sort()).toEqual([
      'FR-001',
      'FR-002',
      'FR-003',
    ]);
  });
});

describe('compareTrace', () => {
  const rows = [
    { id: 'A', codes: ['FR-001', 'FR-002'] },
    { id: 'B', codes: ['FR-002', 'FR-003'] },
  ];

  it('mã thiếu test mà có trong baseline → không đỏ, đếm nợ còn lại', () => {
    const r = compareTrace({ rows, tested: new Set(['FR-001']), baseline: ['FR-002', 'FR-003'] });
    expect(r.newMissing).toEqual([]);
    expect(r.remainingDebt).toEqual(['FR-002', 'FR-003']);
    expect(r.ok).toBe(true);
  });

  it('mã thiếu test và KHÔNG có trong baseline → đỏ, kèm các dòng gap matrix chứa mã đó', () => {
    const r = compareTrace({ rows, tested: new Set(), baseline: ['FR-001'] });
    expect(r.ok).toBe(false);
    expect(r.newMissing).toEqual([
      { code: 'FR-002', rows: ['A', 'B'] },
      { code: 'FR-003', rows: ['B'] },
    ]);
  });

  it('mã trong baseline nay đã có test → báo "có thể xóa khỏi baseline" (không đỏ)', () => {
    const r = compareTrace({
      rows,
      tested: new Set(['FR-001', 'FR-002']),
      baseline: ['FR-001', 'FR-003'],
    });
    expect(r.ok).toBe(true);
    expect(r.removableFromBaseline).toEqual(['FR-001']);
    expect(r.remainingDebt).toEqual(['FR-003']);
  });

  it('mã trong baseline không còn dòng Xong nào đòi → báo baseline thừa', () => {
    const r = compareTrace({
      rows,
      tested: new Set(['FR-001', 'FR-002', 'FR-003']),
      baseline: ['FR-077'],
    });
    expect(r.staleBaseline).toEqual(['FR-077']);
  });
});

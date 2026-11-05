import { describe, expect, it } from 'vitest';
import { filterWorkspacesByName } from './workspace-filter';

const list = [
  { id: '1', name: 'Cửa Hàng Đà Nẵng' },
  { id: '2', name: 'Shop Hoa Sài Gòn' },
  { id: '3', name: 'Agency ĐỒNG Xanh' },
];

describe('FR-005 filterWorkspacesByName — tìm workspace theo tên', () => {
  it('FR-005 bỏ qua hoa/thường và dấu tiếng Việt', () => {
    expect(filterWorkspacesByName(list, 'cua hang').map((w) => w.id)).toEqual(['1']);
    expect(filterWorkspacesByName(list, 'SAI GON').map((w) => w.id)).toEqual(['2']);
  });

  it('FR-005 đ/Đ khớp với d', () => {
    expect(filterWorkspacesByName(list, 'dong xanh').map((w) => w.id)).toEqual(['3']);
    expect(filterWorkspacesByName(list, 'da nang').map((w) => w.id)).toEqual(['1']);
  });

  it('FR-005 ô trống hoặc chỉ khoảng trắng → đủ danh sách, giữ thứ tự', () => {
    expect(filterWorkspacesByName(list, '')).toEqual(list);
    expect(filterWorkspacesByName(list, '   ')).toEqual(list);
  });

  it('FR-005 không khớp → danh sách rỗng', () => {
    expect(filterWorkspacesByName(list, 'zzz')).toEqual([]);
  });

  it('FR-005 khoảng trắng đầu/cuối được cắt', () => {
    expect(filterWorkspacesByName(list, '  hoa ').map((w) => w.id)).toEqual(['2']);
  });
});

import { describe, expect, it } from 'vitest';
import { navGroupsFor } from './app-nav';
import { KB_SUBNAV_GROUPS, kbSubnavFor } from './kb-structure';

describe('FR-146 menu cấu trúc kiến thức (design/stitch/knowledge-base.png)', () => {
  it('FR-146 mọi mục trỏ tới trang có trong điều hướng Owner (không liên kết chết)', () => {
    const ownerHrefs = new Set(navGroupsFor('owner').flatMap((g) => g.items.map((i) => i.href)));
    for (const item of kbSubnavFor()) {
      expect(ownerHrefs.has(item.href), item.href).toBe(true);
    }
  });

  it('FR-146 có đúng hai nhóm: cấu trúc tri thức, tinh chỉnh & kiểm thử; không trùng khóa', () => {
    expect(KB_SUBNAV_GROUPS.map((g) => g.key)).toEqual(['structure', 'tuning']);
    const keys = kbSubnavFor().map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('FR-051 gồm Nhập sản phẩm, FR-059 Thử AI, FR-146 Độ sẵn sàng', () => {
    const keys = kbSubnavFor().map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(['productImport', 'tryAi', 'readiness']));
  });
});

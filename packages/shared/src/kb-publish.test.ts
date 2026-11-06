import { describe, expect, it } from 'vitest';
import {
  categoryOfSource,
  kbPublishJobSchema,
  nextVersionNumber,
  type PlanChunk,
  parsePublishNote,
  planKbVersion,
} from './kb-publish';

const WS = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';

const chunk = (over: Partial<PlanChunk> & { chunkKey: string }): PlanChunk => ({
  sourceId: 's1',
  sourceType: 'faq',
  contentHash: 'h1',
  injectionSuspected: false,
  ...over,
});

describe('FR-054 nextVersionNumber', () => {
  it('chưa có phiên bản → 1; có → max + 1', () => {
    expect(nextVersionNumber(null)).toBe(1);
    expect(nextVersionNumber(0)).toBe(1);
    expect(nextVersionNumber(7)).toBe(8);
  });
});

describe('FR-054 categoryOfSource', () => {
  it('ánh xạ loại nguồn → nhóm thay đổi', () => {
    expect(categoryOfSource('faq')).toBe('faq');
    expect(categoryOfSource('policy')).toBe('policy');
    expect(categoryOfSource('shopify')).toBe('product');
    expect(categoryOfSource('excel')).toBe('product');
    expect(categoryOfSource('manual')).toBe('manual');
    expect(categoryOfSource('url')).toBe('url');
  });
});

describe('FR-054 UF-8 planKbVersion', () => {
  it('không có nháp và không có phiên bản → no_changes', () => {
    expect(planKbVersion([], [])).toMatchObject({ ok: false, reason: 'no_changes' });
  });

  it('nháp giống hệt phiên bản đang chạy → no_changes', () => {
    const a = [chunk({ chunkKey: 'a' }), chunk({ chunkKey: 'b', contentHash: 'h2' })];
    expect(planKbVersion(a, a)).toMatchObject({ ok: false, reason: 'no_changes' });
  });

  it('đếm thêm / đổi / xóa theo chunk_key + content_hash', () => {
    const current = [
      chunk({ chunkKey: 'keep' }),
      chunk({ chunkKey: 'chg', contentHash: 'old' }),
      chunk({ chunkKey: 'gone' }),
    ];
    const next = [
      chunk({ chunkKey: 'keep' }),
      chunk({ chunkKey: 'chg', contentHash: 'new' }),
      chunk({ chunkKey: 'add' }),
    ];
    expect(planKbVersion(next, current)).toMatchObject({
      ok: true,
      added: 1,
      changed: 1,
      removed: 1,
    });
  });

  it('cùng chunk_key ở hai nguồn khác nhau là hai đoạn khác nhau', () => {
    const current = [chunk({ chunkKey: 'k', sourceId: 's1' })];
    const next = [
      chunk({ chunkKey: 'k', sourceId: 's1' }),
      chunk({ chunkKey: 'k', sourceId: 's2' }),
    ];
    expect(planKbVersion(next, current)).toMatchObject({
      ok: true,
      added: 1,
      changed: 0,
      removed: 0,
    });
  });

  it('FR-164 đoạn nghi cài lệnh bị loại khỏi phiên bản và được đếm', () => {
    const next = [chunk({ chunkKey: 'ok' }), chunk({ chunkKey: 'bad', injectionSuspected: true })];
    const plan = planKbVersion(next, []);
    expect(plan).toMatchObject({ ok: true, added: 1, blockedInjection: 1 });
    if (plan.ok) expect(plan.publishKeys).toEqual([{ sourceId: 's1', chunkKey: 'ok' }]);
  });

  it('chỉ có đoạn nghi cài lệnh mới → no_changes (không tạo phiên bản thừa)', () => {
    const current = [chunk({ chunkKey: 'ok' })];
    const next = [chunk({ chunkKey: 'ok' }), chunk({ chunkKey: 'bad', injectionSuspected: true })];
    expect(planKbVersion(next, current)).toMatchObject({ ok: false, reason: 'no_changes' });
  });

  it('nhóm đổi chỉ gồm nguồn có thay đổi, sắp xếp, không trùng', () => {
    const current = [
      chunk({ chunkKey: 'p', sourceId: 's9', sourceType: 'policy', contentHash: 'o' }),
    ];
    const next = [
      chunk({ chunkKey: 'p', sourceId: 's9', sourceType: 'policy', contentHash: 'n' }),
      chunk({ chunkKey: 'f1', sourceId: 's2', sourceType: 'faq' }),
      chunk({ chunkKey: 'f2', sourceId: 's2', sourceType: 'faq' }),
    ];
    expect(planKbVersion(next, current)).toMatchObject({
      ok: true,
      changedCategories: ['faq', 'policy'],
      needsConfirm: true,
    });
  });

  it('đoạn bị xóa tính vào nhóm của nguồn cũ', () => {
    const current = [chunk({ chunkKey: 'x', sourceId: 's8', sourceType: 'shopify' })];
    const next = [chunk({ chunkKey: 'y', sourceId: 's2', sourceType: 'faq' })];
    expect(planKbVersion(next, current)).toMatchObject({
      ok: true,
      changedCategories: ['faq', 'product'],
      needsConfirm: true,
    });
  });

  it('chỉ đổi FAQ/manual/url → không cần xác nhận', () => {
    const next = [
      chunk({ chunkKey: 'f' }),
      chunk({ chunkKey: 'm', sourceId: 's3', sourceType: 'manual' }),
    ];
    expect(planKbVersion(next, [])).toMatchObject({ ok: true, needsConfirm: false });
  });

  it('đích rỗng so với phiên bản hiện tại có đoạn → xóa hết (hợp lệ)', () => {
    expect(planKbVersion([], [chunk({ chunkKey: 'a' })])).toMatchObject({ ok: true, removed: 1 });
  });
});

describe('FR-054 parsePublishNote', () => {
  it('cắt khoảng trắng, rỗng → null, quá 500 ký tự → lỗi', () => {
    expect(parsePublishNote('  hi  ')).toEqual({ ok: true, note: 'hi' });
    expect(parsePublishNote('   ')).toEqual({ ok: true, note: null });
    expect(parsePublishNote(undefined)).toEqual({ ok: true, note: null });
    expect(parsePublishNote(null)).toEqual({ ok: true, note: null });
    expect(parsePublishNote(42)).toEqual({ ok: false });
    expect(parsePublishNote('x'.repeat(500))).toMatchObject({ ok: true });
    expect(parsePublishNote('x'.repeat(501))).toEqual({ ok: false });
  });
});

describe('FR-054 kbPublishJobSchema', () => {
  it('chấp nhận publish và restore; từ chối thiếu số phiên bản/khác loại', () => {
    const base = { workspaceId: WS, requestedBy: USER };
    expect(kbPublishJobSchema.safeParse({ kind: 'publish', ...base }).success).toBe(true);
    expect(
      kbPublishJobSchema.safeParse({ kind: 'restore', ...base, versionNumber: 3 }).success,
    ).toBe(true);
    expect(kbPublishJobSchema.safeParse({ kind: 'restore', ...base }).success).toBe(false);
    expect(
      kbPublishJobSchema.safeParse({ kind: 'restore', ...base, versionNumber: 0 }).success,
    ).toBe(false);
    expect(kbPublishJobSchema.safeParse({ kind: 'x', ...base }).success).toBe(false);
  });
});

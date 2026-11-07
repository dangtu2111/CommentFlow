import type { Database, KbVersionRef } from '@flow/db/runtime';
import { describe, expect, it, vi } from 'vitest';
import type { TryKnowledge } from './try-pipeline';
import { loadWorkspaceKnowledge, type WorkspaceKnowledgeReaders } from './workspace-knowledge';

const tx = {} as Database;
const WS = '11111111-1111-4111-8111-111111111111';
const version: KbVersionRef = { id: '22222222-2222-4222-8222-222222222222', number: 3 };
const base: TryKnowledge = {
  matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
  lookupProductFacts: async () => [],
  searchKb: async () => [],
};
const readers = (
  over: Partial<WorkspaceKnowledgeReaders> = {},
): Partial<WorkspaceKnowledgeReaders> => ({
  countProducts: async () => 0,
  productNames: async () => ['Áo thun basic'],
  shopTexts: async () => [],
  abbreviations: async () => ({ bn: 'bao nhiêu' }),
  brandVoices: async () => [],
  ...over,
});
const params = (over: Record<string, unknown> = {}) => ({
  tx,
  workspaceId: WS,
  version: null as KbVersionRef | null,
  productsEnabled: true,
  base,
  readers: readers(),
  ...over,
});

describe('loadWorkspaceKnowledge — một hàm cho Thử AI và worker', () => {
  it('chưa có dữ liệu thật nào và không có phiên bản → null (nơi gọi dùng mẫu)', async () => {
    expect(await loadWorkspaceKnowledge(params())).toBeNull();
  });

  it('tắt sản phẩm thật: không đọc DB sản phẩm/chính sách', async () => {
    const countProducts = vi.fn(async () => 5);
    const shopTexts = vi.fn(async () => []);
    const out = await loadWorkspaceKnowledge(
      params({ productsEnabled: false, version, readers: readers({ countProducts, shopTexts }) }),
    );
    expect(countProducts).not.toHaveBeenCalled();
    expect(shopTexts).not.toHaveBeenCalled();
    expect(out?.source).toBe('kb');
    expect(out?.context.productNames).toEqual([]);
  });

  it('có chính sách/FAQ thật (không sản phẩm) → mức `shop`, tên sản phẩm rỗng, từ điển + giọng được nạp', async () => {
    const out = await loadWorkspaceKnowledge(
      params({
        readers: readers({
          shopTexts: async () => [
            { kind: 'policy', title: 'Đổi trả', text: 'Đổi trả 7 ngày' } as never,
          ],
        }),
      }),
    );
    expect(out?.source).toBe('shop');
    expect(out?.context.abbreviations).toEqual({ bn: 'bao nhiêu' });
    expect(out?.context.productNames).toEqual([]);
    expect(
      await out?.knowledge.searchKb('đổi trả mấy ngày', { lang: 'vi', productIds: [] }),
    ).toBeDefined();
  });

  it('có sản phẩm thật → tên sản phẩm được nạp; có phiên bản → mức `kb`; bind(tx) dựng cùng nguồn trên giao dịch khác', async () => {
    const out = await loadWorkspaceKnowledge(
      params({ version, readers: readers({ countProducts: async () => 2 }) }),
    );
    expect(out?.source).toBe('kb');
    expect(out?.context.productNames).toEqual(['Áo thun basic']);
    const other = out?.bind({} as Database);
    expect(Object.keys(other ?? {}).sort()).toEqual(Object.keys(out?.knowledge ?? {}).sort());
  });
});

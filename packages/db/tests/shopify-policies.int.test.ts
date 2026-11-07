import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { createPolicyItem } from '../src/queries/kb-content';
import { applyShopifyPolicies, shopifyPolicyKind } from '../src/queries/shopify-policies';
import {
  createAdminPool,
  createAppDb,
  createWorkerDb,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/** SHOPIFY-POLICIES: chính sách nạp từ Shopify cập nhật theo external_key, dọn mục biến mất, KHÔNG đụng mục nhập tay. */
let admin: pg.Pool;
let app: FlowDb;
let worker: FlowDb;
let ws: string;
let other: string;
let owner: string;

const rows = async (workspaceId: string) =>
  (
    await admin.query(
      'SELECT kind, lang, title, content, external_key FROM cf.policy_items WHERE workspace_id = $1 ORDER BY title',
      [workspaceId],
    )
  ).rows as Array<{
    kind: string;
    lang: string;
    title: string;
    content: string;
    external_key: string | null;
  }>;

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  worker = createWorkerDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'pol-owner');
  await seedMember(admin, ws, owner, 'owner');
  await app.withActor(ws, owner, (tx) =>
    createPolicyItem(tx, ws, {
      kind: 'warranty',
      lang: 'vi',
      title: 'Bảo hành nhập tay',
      content: 'Của Owner',
    }),
  );
});
afterAll(async () => {
  await app.close();
  await worker.close();
  await admin.end();
});

describe('shopifyPolicyKind', () => {
  it('vận chuyển → shipping, hoàn tiền → return, còn lại → other', () => {
    expect(shopifyPolicyKind('SHIPPING_POLICY')).toBe('shipping');
    expect(shopifyPolicyKind('REFUND_POLICY')).toBe('return');
    for (const type of [
      'PRIVACY_POLICY',
      'TERMS_OF_SERVICE',
      'CONTACT_INFORMATION',
      'LEGAL_NOTICE',
      'X',
    ]) {
      expect(shopifyPolicyKind(type)).toBe('other');
    }
  });
});

describe('applyShopifyPolicies', () => {
  const policies = [
    { type: 'REFUND_POLICY', title: 'Chính sách hoàn tiền', content: 'Hoàn trong 7 ngày' },
    { type: 'SHIPPING_POLICY', title: 'Chính sách vận chuyển', content: 'Giao 2-3 ngày' },
  ];

  it('lần đầu: tạo mục theo external_key, lang = all, đúng loại', async () => {
    const result = await worker.withJob(ws, (tx) => applyShopifyPolicies(tx, ws, policies));
    expect(result).toEqual({ policiesUpdated: 2, policiesRemoved: 0 });
    const all = await rows(ws);
    expect(all.find((r) => r.external_key === 'shopify:refund_policy')).toMatchObject({
      kind: 'return',
      lang: 'all',
      title: 'Chính sách hoàn tiền',
    });
    expect(all.find((r) => r.external_key === 'shopify:shipping_policy')?.kind).toBe('shipping');
  });

  it('lần sau: cập nhật đúng mục (không nhân đôi); mục nhập tay giữ nguyên', async () => {
    await worker.withJob(ws, (tx) =>
      applyShopifyPolicies(tx, ws, [
        { ...policies[0]!, content: 'Hoàn trong 14 ngày' },
        policies[1]!,
      ]),
    );
    const all = await rows(ws);
    expect(all).toHaveLength(3);
    expect(all.find((r) => r.external_key === 'shopify:refund_policy')?.content).toBe(
      'Hoàn trong 14 ngày',
    );
    expect(all.find((r) => r.external_key === null)).toMatchObject({
      title: 'Bảo hành nhập tay',
      content: 'Của Owner',
    });
  });

  it('chính sách biến mất trên Shopify → xóa mục đã nạp, không đụng mục nhập tay', async () => {
    const result = await worker.withJob(ws, (tx) => applyShopifyPolicies(tx, ws, [policies[0]!]));
    expect(result.policiesRemoved).toBe(1);
    const all = await rows(ws);
    expect(all.map((r) => r.external_key).sort()).toEqual([null, 'shopify:refund_policy']);
  });

  it('danh sách rỗng → KHÔNG xóa gì (chốt an toàn)', async () => {
    const result = await worker.withJob(ws, (tx) => applyShopifyPolicies(tx, ws, []));
    expect(result).toEqual({ policiesUpdated: 0, policiesRemoved: 0 });
    expect(await rows(ws)).toHaveLength(2);
  });

  it('nội dung dài bị cắt 8000, tiêu đề cắt 200; loại lạ bị bỏ qua', async () => {
    await worker.withJob(ws, (tx) =>
      applyShopifyPolicies(tx, ws, [
        { type: 'TERMS_OF_SERVICE', title: 'T'.repeat(500), content: 'x'.repeat(9000) },
        { type: 'bad key!', title: 'Lạ', content: 'nội dung' },
        { type: 'REFUND_POLICY', title: 'Hoàn tiền', content: 'giữ' },
      ]),
    );
    const terms = (await rows(ws)).find((r) => r.external_key === 'shopify:terms_of_service');
    expect(terms?.content).toHaveLength(8000);
    expect(terms?.title).toHaveLength(200);
    expect((await rows(ws)).some((r) => r.title === 'Lạ')).toBe(false);
  });

  it('cô lập workspace: không đụng chính sách của workspace khác', async () => {
    await worker.withJob(other, (tx) => applyShopifyPolicies(tx, other, [policies[1]!]));
    expect(await rows(other)).toHaveLength(1);
    expect((await rows(ws)).length).toBeGreaterThan(1);
  });

  it('mục nội dung rỗng sau khi làm sạch bị bỏ qua', async () => {
    const before = (await rows(other)).length;
    await worker.withJob(other, (tx) =>
      applyShopifyPolicies(tx, other, [
        { type: 'REFUND_POLICY', title: 'Rỗng', content: '' },
        { type: 'SHIPPING_POLICY', title: 'Vận chuyển', content: 'giữ' },
      ]),
    );
    expect((await rows(other)).some((r) => r.title === 'Rỗng')).toBe(false);
    expect((await rows(other)).length).toBeGreaterThanOrEqual(before);
  });
});

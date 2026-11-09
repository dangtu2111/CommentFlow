import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: vi.fn() }));
vi.mock('@flow/db/runtime', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listAllPolicyFacts: async () => mocks.rows,
}));
vi.mock('../../../../../../server/require-app-user', () => ({
  requireAppUser: async () => ({ user: { id: 'u1' }, workspace: { id: 'w1' } }),
}));
vi.mock('../../../../../../server/db', () => ({
  getDb: () => ({
    withActor: async (_w: string, _u: string, run: (tx: unknown) => unknown) => run({}),
  }),
}));
vi.mock('../../../../../../server/brand', () => ({ getBrand: () => ({ name: 'CF' }) }));
vi.mock('../../../../../../components/kb/kb-frame', () => ({
  KbFrame: ({ children }: { children: unknown }) => children,
}));
vi.mock('../../../../../../components/kb/policy-value-form', () => ({
  PolicyValueForm: (props: Record<string, unknown>) => (
    <script type="application/json" id="props">
      {JSON.stringify({
        kind: props.kind,
        defaults: props.defaults,
        draft: props.draft,
        labelEditable: props.labelEditable,
        heading: props.heading,
        evidence: props.evidence,
      })}
    </script>
  ),
}));
vi.mock('../../policy-actions', () => ({ savePolicyValueAction: async () => {} }));

import KbPolicyEditPage from './page';

const row = (over: Record<string, unknown>) => ({
  id: 'r1',
  kind: 'returns',
  slot: 'returns',
  data: { days: 7, conditions: ['Còn tem mác'], refundTo: 'original_payment' },
  status: 'approved',
  origin: 'manual',
  evidence: null,
  sourceRef: null,
  rev: 1,
  updatedAt: '2026-11-09 13:12:14+00',
  approvedAt: null,
  ...over,
});

/** Dựng trang rồi đọc lại props đã truyền cho biểu mẫu (phần điền sẵn nằm ở `PolicyValueForm`, có test riêng). */
const render = async (query: Record<string, string>) => {
  const html = renderToStaticMarkup(
    (await KbPolicyEditPage({ searchParams: Promise.resolve(query) })) as never,
  );
  const json = html.match(/<script[^>]*>(.*)<\/script>/)?.[1] ?? '{}';
  return JSON.parse(json.replace(/&quot;/g, '"').replace(/&#x27;/g, "'")) as {
    kind: string;
    defaults: Record<string, string | string[]>;
    draft: { id: string; rev: number } | null;
    labelEditable: boolean;
    heading: string;
    evidence: string | null;
  };
};

beforeEach(() => {
  mocks.rows = [];
  mocks.notFound.mockClear();
});

describe('Trang sửa tay chính sách — điền sẵn giá trị đang có', () => {
  it('sửa bản đã duyệt (đổi trả): defaults mang số ngày, điều kiện, hoàn tiền; heading = edit', async () => {
    mocks.rows = [row({})];
    const out = await render({ kind: 'returns', id: 'r1' });
    expect(out.heading).toBe('edit');
    expect(out.defaults).toMatchObject({
      days: '7',
      conditions: 'Còn tem mác',
      refundTo: 'original_payment',
    });
    expect(out.draft).toBeNull();
  });

  it('có nháp cùng slot: điền sẵn từ NHÁP và kèm draft {id, rev}', async () => {
    mocks.rows = [
      row({}),
      row({ id: 'd1', status: 'draft', origin: 'text_suggested', rev: 4, data: { days: 14 } }),
    ];
    const out = await render({ kind: 'returns', id: 'r1' });
    expect(out.defaults).toMatchObject({ days: '14' });
    expect(out.draft).toEqual({ id: 'd1', rev: 4 });
  });

  it('ship: điền sẵn nhãn, phí, ngày, COD; nhãn khóa vì dòng đã có', async () => {
    mocks.rows = [
      row({
        id: 's1',
        kind: 'ship_region',
        slot: 'toan quoc',
        data: {
          kind: 'nationwide',
          label: 'Toàn quốc',
          currency: 'VND',
          feeMinor: 30000,
          daysMin: 2,
          daysMax: 4,
          cod: true,
        },
      }),
    ];
    const out = await render({ kind: 'ship_region', id: 's1' });
    expect(out.labelEditable).toBe(false);
    expect(out.defaults).toMatchObject({
      label: 'Toàn quốc',
      feeAmount: '30000',
      daysMin: '2',
      daysMax: '4',
      cod: 'yes',
    });
  });

  it('loại một giá trị: bấm Thêm khi đã có dòng → quay về sửa dòng đó (điền sẵn)', async () => {
    mocks.rows = [
      row({ kind: 'warranty', slot: 'warranty', data: { months: 3, scope: 'đường may' } }),
    ];
    const out = await render({ kind: 'warranty' });
    expect(out.heading).toBe('edit');
    expect(out.defaults).toMatchObject({ months: '3', scope: 'đường may' });
  });

  it('thêm mới ship: nhãn nhập được; chưa có dòng: heading = add; kind lạ hoặc id lạ → 404', async () => {
    const created = await render({ kind: 'ship_region' });
    expect(created.heading).toBe('add');
    expect(created.labelEditable).toBe(true);
    await expect(render({ kind: 'cash' })).rejects.toThrow('NOT_FOUND');
    mocks.rows = [row({})];
    await expect(render({ kind: 'returns', id: 'khong-co' })).rejects.toThrow('NOT_FOUND');
  });

  it('sửa COD chung từ thẻ Ship: điền sẵn Có/Không (không còn 404)', async () => {
    mocks.rows = [row({ id: 'c1', kind: 'cod', slot: 'cod', data: { value: false } })];
    const out = await render({ kind: 'cod', id: 'c1' });
    expect(out.heading).toBe('edit');
    expect(out.defaults).toEqual({ codValue: 'no' });
  });

  it('nháp của máy: truyền câu gốc (evidence) sang biểu mẫu', async () => {
    mocks.rows = [
      row({
        id: 'd9',
        status: 'draft',
        origin: 'text_suggested',
        evidence: 'Đổi trả trong 7 ngày',
        data: { days: 7 },
      }),
    ];
    const out = await render({ kind: 'returns', id: 'd9' });
    expect(out.evidence).toBe('Đổi trả trong 7 ngày');
  });
});

import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftResult } from '../draft/draft-result';
import type { Drafter, DraftInput } from '../draft/drafter';
import type { PlanProduct, PolicyFacts, ShipRow } from '../fact-plan';
import type { TryCandidate, TryKnowledge } from '../try/try-pipeline';
import { type PipelineInput, runPipeline } from './run-pipeline';

/** DRAFT-FACT-SLOTS (ADR 017) nối vào pipeline sau cờ `factSlots`: fact plan do code lập, LLM chỉ viết với {fact:id}, code điền. */
const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const };
const tote: PlanProduct = {
  id: 'p-tote',
  name: 'Túi tote canvas',
  currency: 'VND',
  priceMinor: 99000,
  stock: 25,
  variants: [],
};
const toteCandidate: TryCandidate = {
  id: 'p-tote',
  kind: 'product',
  title: 'Túi tote canvas',
  text: unsafeMarkMasked('Túi tote canvas: giá 99.000đ; còn 25.'),
  score: 0.95,
  topics: ['product_info'],
};
const knowledge: TryKnowledge = {
  matchProducts: async () => ({ ids: ['p-tote'], names: ['Túi tote canvas'], missingAxes: [] }),
  lookupProductFacts: async () => [toteCandidate],
  lookupPlanProducts: async () => [tote],
  searchKb: async () => [],
};
const ship = (over: Partial<ShipRow> = {}): ShipRow => ({
  kind: 'nationwide',
  label: 'Toàn quốc',
  feeMinor: 30000,
  currency: 'VND',
  daysMin: 2,
  daysMax: 4,
  sourceId: 'policy:ship',
  ...over,
});
const policy = (rows: ShipRow[]): PolicyFacts => ({ shipping: rows });
const slots = (rows: ShipRow[]): NonNullable<PipelineInput['factSlots']> => ({
  policy: policy(rows),
  stock: { disclose: 'status', lowAt: null },
});
const extractFor = (asks: string[], label: 'price' | 'advice' = 'price'): ExtractResult => ({
  ...FIXTURE_EXTRACT_DEFAULT,
  labels: [{ label }],
  asks,
  product_mentions: ['tote'],
});
const draftOf = (reply: string, variants: string[] = []): DraftResult => ({
  reply,
  lang: 'vi',
  sources: [],
  claims: [],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants,
});

function fakeDrafter(draft: DraftResult) {
  const calls: DraftInput[] = [];
  const drafter: Drafter = {
    async draft(input) {
      calls.push(input);
      if (input.decision?.action === 'handoff') {
        return { ...draftOf(''), needs_human: true, reason: 'handoff' };
      }
      return draft;
    },
  };
  return { drafter, calls };
}

const run = async (
  text: string,
  asks: string[],
  draft: DraftResult,
  factSlots?: PipelineInput['factSlots'],
  know: TryKnowledge = knowledge,
) => {
  const { drafter, calls } = fakeDrafter(draft);
  const result = await runPipeline(
    {
      workspaceId: 'ws1',
      text,
      kbVersion: 'v1',
      voice,
      autoSendEnabled: true,
      ...(factSlots ? { factSlots } : {}),
    },
    {
      extractor: createFixtureExtractor([{ match: /./, result: extractFor(asks) }]),
      drafter,
      knowledge: know,
    },
  );
  if (result.status !== 'done') throw new Error(`expected done, got ${result.status}`);
  return { result, calls };
};

const MIXED_11 = 'Tote bag giá bao nhiêu, ship Hà Nội mất mấy ngày?';
const ASKS = ['giá', 'thời gian giao hàng'];
const GOOD = draftOf(
  '{fact:product_name.1} giá {fact:price.1}, giao trong {fact:ship_time} bạn nhé!',
);

describe('chế độ chỗ giữ chỗ (cờ factSlots)', () => {
  it('mixed-11: shop chỉ khai "Toàn quốc" → trả lời giá + thời gian giao do CODE điền, 1 lần gọi LLM, claims/nguồn do code sinh, guard sạch', async () => {
    const { result, calls } = await run(MIXED_11, ASKS, GOOD, slots([ship()]));
    expect(calls).toHaveLength(1);
    expect(result.decision.action).toBe('answer');
    expect(result.reply).toBe('Túi tote canvas giá 99.000đ, giao trong 2–4 ngày bạn nhé!');
    expect(result.draft.sources).toEqual(['p-tote', 'policy:ship']);
    expect(result.draft.claims).toEqual([
      {
        text: 'Túi tote canvas giá 99.000đ, giao trong 2–4 ngày bạn nhé!',
        source_ids: ['p-tote', 'policy:ship'],
        kind: 'fact',
      },
    ]);
    expect(result.guard).toMatchObject({ ok: true, violations: [], replyViolations: [] });
    expect(result.slotDiagnostics).toEqual({ rawTexts: 1, rejected: 0, chosen: 'reply' });
    expect(result.factPlan?.facts.map((f) => f.id)).toEqual([
      'product_name.1',
      'price.1',
      'ship_time',
    ]);
    // LLM nhận danh sách mã sự kiện, KHÔNG nhận giá trị.
    expect(calls[0]?.factSlots?.facts.map((f) => f.id)).toEqual([
      'product_name.1',
      'price.1',
      'ship_time',
    ]);
  });

  it('không có chính sách ship → phần ship là unknown: trả lời phần giá, CODE thêm câu mời theo xưng hô, ghi chủ đề chưa trả lời', async () => {
    const { result } = await run(MIXED_11, ASKS, GOOD, slots([]));
    expect(result.reply).toContain('99.000đ');
    expect(result.reply).not.toMatch(/2–4|ngày bạn nhé/);
    expect(result.reply).toMatch(/Phần thời gian giao hàng, bạn nhắn shop để được hỗ trợ nhé\.$/);
    expect(result.draft.unanswered_topics).toContain('shipping');
  });

  it('tiếng Anh: giá điền theo ngôn ngữ ($/dấu chấm), câu mời "we/us", không dùng xưng hô tiếng Việt', async () => {
    const usd: PlanProduct = {
      ...tote,
      name: '14-in-1 Bench A4',
      currency: 'USD',
      priceMinor: 5890,
    };
    const draft = {
      ...draftOf('{fact:product_name.1} is {fact:price.1}, delivery {fact:ship_time}.'),
      lang: 'en' as const,
    };
    const { result } = await run(
      'How much is the bench and how long is delivery to Hanoi?',
      ['price', 'delivery time'],
      draft,
      slots([]),
      { ...knowledge, lookupPlanProducts: async () => [usd] },
    );
    // Bản của LLM dùng sự kiện `unknown` (ship_time) → bị từ chối; câu dự phòng do code dựng + câu mời cho phần chưa rõ.
    expect(result.reply).toBe(
      '14-in-1 Bench A4 is $58.90. For shipping fees and delivery time, please message us and we will help.',
    );
  });

  it('khách chưa nêu địa điểm mà phí khác nhau theo khu vực → HỎI tỉnh/thành (clarify), không redirect', async () => {
    const rows = [
      ship({ kind: 'city', label: 'Nội thành Hà Nội', city: 'Hà Nội', feeMinor: 20000 }),
      ship(),
    ];
    const question = draftOf('Bạn ở tỉnh/thành nào để shop báo phí ship nhé?');
    const { result, calls } = await run(
      'Tote bag ship bao nhiêu',
      ['phí ship'],
      question,
      slots(rows),
    );
    expect(result.decision).toMatchObject({
      action: 'clarify',
      reason: 'region_missing',
      clarify: { ask: 'region' },
    });
    expect(calls[0]?.factSlots).toBeUndefined();
    expect(result.reply).toBe('Bạn ở tỉnh/thành nào để shop báo phí ship nhé?');
  });

  it('khách nêu "Hà Nội" mà shop có dòng nội thành Hà Nội → dùng phí nội thành (không đoán khi thiếu dòng)', async () => {
    const rows = [
      ship({
        kind: 'city',
        label: 'Nội thành Hà Nội',
        city: 'Hà Nội',
        feeMinor: 20000,
        daysMin: 1,
        daysMax: 2,
      }),
      ship(),
    ];
    const draft = draftOf(
      '{fact:product_name.1} giá {fact:price.1}, ship {fact:ship_fee}, giao {fact:ship_time} bạn nhé!',
    );
    const { result } = await run(
      'Tote bag giá bao nhiêu, phí ship Hà Nội, giao bao lâu?',
      ['giá', 'phí ship', 'thời gian'],
      draft,
      slots(rows),
    );
    expect(result.reply).toBe('Túi tote canvas giá 99.000đ, ship 20.000đ, giao 1–2 ngày bạn nhé!');
  });

  it('LLM viết chữ số/khẳng định ngoài chỗ giữ chỗ → TỪ CHỐI, dùng biến thể hợp lệ nếu có', async () => {
    const bad = draftOf('Túi giá 99.000đ, giao trong 2 ngày bạn nhé!', [
      'Shop có COD, {fact:price.1} bạn nhé!',
      '{fact:product_name.1} chỉ {fact:price.1}, ship {fact:ship_time} nhé bạn.',
    ]);
    const { result, calls } = await run(MIXED_11, ASKS, bad, slots([ship()]));
    expect(calls).toHaveLength(1);
    expect(result.reply).toBe('Túi tote canvas chỉ 99.000đ, ship 2–4 ngày nhé bạn.');
  });

  it('mọi bản của LLM đều vi phạm hoặc thiếu sự kiện bắt buộc → câu DỰ PHÒNG do code dựng (vẫn đúng, vẫn 1 lần gọi LLM)', async () => {
    const bad = draftOf('Giá 99.000đ nhé bạn!', ['{fact:price.1} nhé bạn!']); // biến thể thiếu ship_time
    const { result, calls } = await run(MIXED_11, ASKS, bad, slots([ship()]));
    expect(calls).toHaveLength(1);
    expect(result.decision.action).toBe('answer');
    expect(result.reply).toBe('Túi tote canvas giá 99.000đ. Thời gian giao hàng 2–4 ngày.');
    expect(result.guard.ok).toBe(true);
  });

  it('LLM bịa mã sự kiện không có trong plan → từ chối (không lọt chỗ giữ chỗ lạ)', async () => {
    const bad = draftOf('{fact:made_up} giá {fact:price.1}, giao {fact:ship_time}!');
    const { result } = await run(MIXED_11, ASKS, bad, slots([ship()]));
    expect(result.reply).not.toContain('made_up');
    expect(result.reply).toBe('Túi tote canvas giá 99.000đ. Thời gian giao hàng 2–4 ngày.');
  });

  it('biến thể hợp lệ CÙNG tập chỗ giữ chỗ được điền và giữ làm biến thể; biến thể khác tập bị bỏ', async () => {
    const draft = draftOf('{fact:product_name.1} giá {fact:price.1}, giao {fact:ship_time} nhé!', [
      'Giá {fact:product_name.1} là {fact:price.1}, giao {fact:ship_time} bạn nhé.',
      '{fact:product_name.1} giá {fact:price.1}, giao {fact:ship_time}, ship {fact:ship_fee} nhé.',
    ]);
    const { result } = await run(MIXED_11, ASKS, draft, slots([ship()]));
    expect(result.reply).toBe('Túi tote canvas giá 99.000đ, giao 2–4 ngày nhé!');
    expect(result.variants).toEqual(['Giá Túi tote canvas là 99.000đ, giao 2–4 ngày bạn nhé.']);
  });

  it('không điền được giá trị (tiền tệ hỏng) → chuyển người "claim_unsupported", không để chỗ giữ chỗ trần lọt ra', async () => {
    const broken: PlanProduct = { ...tote, currency: 'usd' };
    const { result } = await run(MIXED_11, ASKS, GOOD, slots([ship()]), {
      ...knowledge,
      lookupPlanProducts: async () => [broken],
    });
    expect(result.decision).toMatchObject({ action: 'handoff', reason: 'claim_unsupported' });
    expect(result.reply).not.toContain('{fact:');
  });

  it('bộ soạn đã trả needs_human → giữ nguyên (không dựng câu thay)', async () => {
    const nh = { ...draftOf(''), needs_human: true, reason: 'x' };
    const { result } = await run(MIXED_11, ASKS, nh, slots([ship()]));
    expect(result.draft.needs_human).toBe(true);
  });

  it('thiếu hàm lookupPlanProducts (chưa nối DB) → không có sự kiện sản phẩm: chỉ chính sách + mời; không sập', async () => {
    const { lookupPlanProducts: _omit, ...withoutPlan } = knowledge;
    const { result } = await run(MIXED_11, ASKS, GOOD, slots([ship()]), withoutPlan);
    expect(result.factPlan?.facts.every((f) => f.kind !== 'price')).toBe(true);
  });

  it('cờ TẮT (không truyền factSlots) → hành vi cũ, không có factPlan', async () => {
    const { result, calls } = await run(MIXED_11, ASKS, draftOf('Túi giá 99.000đ bạn nhé!'));
    expect(result.factPlan).toBeUndefined();
    expect(calls[0]?.factSlots).toBeUndefined();
  });
});

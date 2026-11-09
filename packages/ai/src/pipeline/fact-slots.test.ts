import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftResult } from '../draft/draft-result';
import type { Drafter, DraftInput } from '../draft/drafter';
import type { FactTopic, PlanProduct, PolicyFacts, ShipRow } from '../fact-plan';
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
// Chủ đề do `extract` trả (enum) — trong test dựng từ ý hỏi bằng bảng nhỏ (KHÔNG có hàm đoán từ khóa trong mã thật).
const TOPIC_OF_ASK: Record<string, FactTopic> = {
  giá: 'price',
  price: 'price',
  'phí ship': 'ship_fee',
  'thời gian': 'ship_time',
  'thời gian giao hàng': 'ship_time',
  'delivery time': 'ship_time',
  'còn mấy cái': 'stock',
};
const extractFor = (asks: string[], label: 'price' | 'advice' = 'price'): ExtractResult => ({
  ...FIXTURE_EXTRACT_DEFAULT,
  labels: [{ label }],
  asks,
  topics: asks.flatMap((ask) => (TOPIC_OF_ASK[ask] ? [TOPIC_OF_ASK[ask]] : [])),
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
    expect(result.slotDiagnostics).toEqual({
      rawTexts: 1,
      rejected: 0,
      chosen: 'reply',
      rejections: [],
    });
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
      '14-in-1 Bench A4 is $58.90. For delivery time, please message us and we will help.',
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

  it('GỐC LỖI (syn2-vi-11): bộ soạn đặt needs_human nhưng viết {fact:…} hợp lệ → VẪN qua bước kiểm/điền, code điền giá trị, không để mã lọt', async () => {
    const leak = {
      ...draftOf('Túi tote canvas giá {fact:price.1}, giao đến Hà Nội trong {fact:ship_time}.', [
        'Giá {fact:price.1}.',
      ]),
      needs_human: true,
      reason: 'x',
    };
    const { result } = await run(MIXED_11, ASKS, leak, slots([ship()]));
    expect(result.decision.action).toBe('answer');
    expect(result.reply).toBe('Túi tote canvas giá 99.000đ, giao đến Hà Nội trong 2–4 ngày.');
    expect(result.draft.needs_human).toBe(false);
    expect(result.slotDiagnostics).toMatchObject({ rejected: 1, chosen: 'reply' });
    expect(result.slotDiagnostics?.finalNetTriggered).toBeUndefined();
  });

  it('needs_human + {fact:…} KHÔNG có trong plan / unknown → bị từ chối cứng ngay lúc kiểm, đi câu dự phòng do code dựng', async () => {
    const bad = {
      ...draftOf('Giá {fact:price.9}, giao {fact:ship_cod}.', []),
      needs_human: true,
      reason: 'x',
    };
    const { result } = await run(MIXED_11, ASKS, bad, slots([ship()]));
    expect(result.reply).not.toContain('{fact:');
    expect(result.slotDiagnostics).toMatchObject({ rejected: 1, chosen: 'fallback' });
    expect(result.slotDiagnostics?.finalNetTriggered).toBeUndefined();
  });

  it('LƯỚI CHẶN CUỐI: ngoài đường điền (clarify) mà câu còn {fact:…} → chuyển người, ghi finalNetTriggered', async () => {
    const rows = [
      ship({ kind: 'city', label: 'Nội thành Hà Nội', city: 'Hà Nội', feeMinor: 20000 }),
      ship(),
    ];
    const leak = draftOf('Phí ship {fact:ship_fee}, bạn ở tỉnh nào ạ?');
    const { result } = await run('Tote bag ship bao nhiêu', ['phí ship'], leak, slots(rows));
    expect(result.decision.action).toBe('handoff');
    expect(result.reply).not.toContain('{fact:');
    expect(result.slotDiagnostics).toMatchObject({ chosen: 'handoff', finalNetTriggered: true });
  });

  it('khách nói "đen"/size M → khớp biến thể (attrs_norm: đen→black) và nêu ĐÚNG số của biến thể, không phải số tổng sản phẩm', async () => {
    const shirt: PlanProduct = {
      id: 'p-shirt',
      name: 'Áo thun basic',
      currency: 'VND',
      priceMinor: 150000,
      stock: 26,
      variants: [
        {
          label: 'Size M, Màu Đen',
          attrsNorm: { size: 'm', color: 'black' },
          priceMinor: 150000,
          stock: 5,
        },
        {
          label: 'Size M, Màu Trắng',
          attrsNorm: { size: 'm', color: 'white' },
          priceMinor: 150000,
          stock: 9,
        },
      ],
    };
    const know: TryKnowledge = {
      ...knowledge,
      matchProducts: async () => ({ ids: ['p-shirt'], names: ['Áo thun basic'], missingAxes: [] }),
      lookupPlanProducts: async () => [shirt],
      lookupProductFacts: async () => [
        {
          ...toteCandidate,
          id: 'p-shirt',
          title: 'Áo thun basic',
          text: unsafeMarkMasked('Áo thun basic: giá 150.000đ.'),
        },
      ],
    };
    const { drafter } = fakeDrafter(draftOf('{fact:product_name.1} hiện {fact:stock.1} bạn nhé.'));
    const result = await runPipeline(
      {
        workspaceId: 'ws1',
        text: 'Áo thun basic size M màu đen còn mấy cái',
        kbVersion: 'v1',
        voice,
        autoSendEnabled: true,
        factSlots: { policy: policy([]), stock: { disclose: 'count', lowAt: null } },
      },
      {
        extractor: createFixtureExtractor([
          { match: /./, result: { ...extractFor(['còn mấy cái']), size: 'M', color: 'đen' } },
        ]),
        drafter,
        knowledge: know,
      },
    );
    if (result.status !== 'done') throw new Error('expected done');
    expect(result.reply).toBe('Áo thun basic hiện còn 5 sản phẩm bạn nhé.');
  });

  it('chẩn đoán ghi LÝ DO từ chối cứng từng câu (mã guard + sự kiện bắt buộc còn thiếu)', async () => {
    const bad = draftOf('Giá 99.000đ nhé!');
    const { result } = await run(MIXED_11, ASKS, bad, slots([ship()]));
    expect(result.slotDiagnostics?.rejections).toEqual([
      {
        text: 'Giá 99.000đ nhé!',
        which: 'reply',
        codes: ['digit', 'missing_required:price.1+ship_time'],
      },
    ]);
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

describe('số khách nêu (extract.qty) đi qua customer_measure — không whitelist số trong câu khách', () => {
  const orderDraft = draftOf(
    '{fact:product_name.1} giá {fact:price.1}, shop ghi nhận bạn lấy {fact:customer_measure.1} cái nhé!',
  );
  const runQty = (draft: DraftResult) => {
    const { drafter } = fakeDrafter(draft);
    return runPipeline(
      {
        workspaceId: 'ws1',
        text: 'Túi tote bao nhiêu, em lấy 1 cái',
        kbVersion: 'v1',
        voice,
        autoSendEnabled: true,
        factSlots: slots([]),
      },
      {
        extractor: createFixtureExtractor([
          { match: /./, result: { ...extractFor(['giá']), qty: 1 } },
        ]),
        drafter,
        knowledge,
      },
    );
  };
  it('"lấy {fact:customer_measure.1} cái" hợp lệ: code điền số lượng khách nêu', async () => {
    const result = await runQty(orderDraft);
    if (result.status !== 'done') throw new Error('expected done');
    expect(result.reply).toBe('Túi tote canvas giá 99.000đ, shop ghi nhận bạn lấy 1 cái nhé!');
    expect(result.slotDiagnostics?.rejected).toBe(0);
  });
  it('viết thẳng "lấy 1 cái" (chữ số ngoài chỗ giữ chỗ) vẫn bị từ chối cứng', async () => {
    const result = await runQty(
      draftOf('{fact:product_name.1} giá {fact:price.1}, bạn lấy 1 cái nhé!'),
    );
    if (result.status !== 'done') throw new Error('expected done');
    expect(result.slotDiagnostics?.rejections?.[0]?.codes).toContain('digit');
  });
});

describe('ngôn ngữ câu ngắn: previousLang → replyLanguage → vi (nhóm 7)', () => {
  const langOf = async (text: string, over: Partial<PipelineInput> = {}) => {
    const { drafter, calls } = fakeDrafter(draftOf('{fact:product_name.1} {fact:price.1}.'));
    await runPipeline(
      {
        workspaceId: 'ws1',
        text,
        kbVersion: 'v1',
        voice,
        autoSendEnabled: true,
        factSlots: slots([]),
        ...over,
      },
      {
        extractor: createFixtureExtractor([{ match: /./, result: extractFor(['giá']) }]),
        drafter,
        knowledge,
      },
    );
    return calls[0]?.lang;
  };
  it.each(['still available?', 'how much?'])(
    '"%s": replyLanguage "en" → soạn tiếng Anh',
    async (text) => {
      expect(await langOf(text, { replyLanguage: 'en' })).toBe('en');
    },
  );
  it('previousLang thắng replyLanguage; không có cả hai → vi', async () => {
    expect(await langOf('how much?', { previousLang: 'vi', replyLanguage: 'en' })).toBe('vi');
    expect(await langOf('how much?', { previousLang: 'en' })).toBe('en');
    expect(await langOf('how much?')).toBe('vi');
  });
});

describe('mọi biến thể CÙNG giá → trả lời giá, không hỏi biến thể (mẫu sswiftly 02/05); khác giá vẫn hỏi', () => {
  const productWith = (prices: number[]): PlanProduct => ({
    id: 'p-set',
    name: 'Shower set',
    currency: 'USD',
    priceMinor: null,
    stock: 5,
    variants: prices.map((priceMinor, i) => ({
      label: `Color ${i}`,
      attrsNorm: { color: `c${i}` },
      priceMinor,
      stock: 1,
    })),
  });
  const runPrices = async (prices: number[], factSlots?: PipelineInput['factSlots']) => {
    const askVariant = new Set(prices).size > 1 || prices.includes(null as never);
    const { drafter } = fakeDrafter(
      draftOf(
        askVariant ? 'Which color would you like?' : '{fact:product_name.1} is {fact:price.1}.',
      ),
    );
    const result = await runPipeline(
      {
        workspaceId: 'ws1',
        text: 'how much is the shower set',
        kbVersion: 'v1',
        voice,
        autoSendEnabled: true,
        ...(factSlots ? { factSlots } : {}),
      },
      {
        extractor: createFixtureExtractor([
          {
            match: /./,
            result: {
              ...extractFor(['how much']),
              product_mentions: ['shower set'],
              topics: ['price'],
            },
          },
        ]),
        drafter,
        knowledge: {
          ...knowledge,
          matchProducts: async () => ({
            ids: ['p-set'],
            names: ['Shower set'],
            missingAxes: ['color'],
          }),
          lookupPlanProducts: async () => [productWith(prices)],
          lookupProductFacts: async () => [
            {
              ...toteCandidate,
              id: 'p-set',
              title: 'Shower set',
              text: unsafeMarkMasked('Shower set: price $59.00'),
            },
          ],
        },
      },
    );
    if (result.status !== 'done') throw new Error('expected done');
    return result;
  };
  it('cùng giá → answer (có và không bật fact plan)', async () => {
    const withSlots = await runPrices([5900, 5900], slots([]));
    expect(withSlots.decision.action).toBe('answer');
    expect(withSlots.reply).toBe('Shower set is $59.00.');
    expect((await runPrices([5900, 5900])).decision.action).toBe('answer');
  });
  it('khác giá hoặc thiếu giá → vẫn hỏi biến thể', async () => {
    expect((await runPrices([5900, 6900], slots([]))).decision.reason).toBe('variant_missing');
    expect((await runPrices([5900, null as never], slots([]))).decision.reason).toBe(
      'variant_missing',
    );
  });
});

describe('địa điểm chỉ lấy từ extract.destination hoặc khi có chủ đề ship_destination', () => {
  const runShip = async (text: string, topics: FactTopic[], destination: string | null) => {
    const { drafter } = fakeDrafter(draftOf('{fact:price.1}; {fact:ship_fee}.'));
    const result = await runPipeline(
      {
        workspaceId: 'ws1',
        text,
        kbVersion: 'v1',
        voice,
        autoSendEnabled: true,
        factSlots: slots([ship()]),
      },
      {
        extractor: createFixtureExtractor([
          { match: /./, result: { ...extractFor(['giá']), topics, destination } },
        ]),
        drafter,
        knowledge,
      },
    );
    if (result.status !== 'done') throw new Error('expected done');
    return result;
  };
  it('"Georgia peach dress" hỏi giá + phí ship: KHÔNG bị hiểu là ship tới Mỹ (dòng ship VN vẫn dùng được)', async () => {
    const r = await runShip(
      'Georgia peach dress giá bao nhiêu, ship bao nhiêu',
      ['price', 'ship_fee'],
      null,
    );
    expect(r.factPlan?.facts.find((f) => f.id === 'ship_fee')?.status).toBe('known');
  });
  it('hỏi "ship to Georgia?" (có chủ đề ship_destination) thì mới quét câu', async () => {
    const r = await runShip('do you ship to Georgia', ['ship_destination'], null);
    expect(r.factPlan?.facts.find((f) => f.id === 'ship_destination')).toMatchObject({
      status: 'known',
      value: { ok: false },
    });
  });
});

describe('khuyến mãi không phải giá/tồn (mẫu *-28, en-32)', () => {
  const noProduct: TryKnowledge = {
    ...knowledge,
    matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
    lookupPlanProducts: async () => [],
    lookupProductFacts: async () => [],
  };
  const runDiscount = async (text: string, ask: string) => {
    const { drafter } = fakeDrafter(draftOf('Sorry.'));
    const result = await runPipeline(
      {
        workspaceId: 'ws1',
        text,
        kbVersion: 'v1',
        voice,
        autoSendEnabled: true,
        factSlots: slots([ship()]),
      },
      {
        // LLM đánh dấu nhầm price cho ý hỏi giảm giá; code lọc theo ý hỏi đã có.
        extractor: createFixtureExtractor([
          { match: /./, result: { ...extractFor([ask]), topics: ['price'], product_mentions: [] } },
        ]),
        drafter,
        knowledge: noProduct,
      },
    );
    if (result.status !== 'done') throw new Error('expected done');
    return result;
  };
  it.each([
    ['Mua 2 cái có giảm k shop', 'mua 2 cái có giảm giá không'],
    ['if I buy 3 do I get a discount?', 'discount when buying 3'],
  ])(
    '"%s" → redirect/topic_unsourced, chủ đề chưa trả lời = discount, không hỏi lại sản phẩm',
    async (text, ask) => {
      const r = await runDiscount(text, ask);
      expect(r.decision.action).toBe('redirect');
      expect(r.decision.reason).toBe('topic_unsourced');
      expect(r.decision.unansweredTopics).toEqual(['discount']);
      expect(r.decision.clarify).toBeNull();
    },
  );
});

describe('hàng lỗi trùng phạm vi bảo hành (vi-12): trả lời từ thẻ bảo hành nhưng bắt buộc người duyệt', () => {
  const warrantyPolicy = (
    over: Partial<NonNullable<PolicyFacts['warranty']>> | null,
  ): NonNullable<PipelineInput['factSlots']> => ({
    policy: {
      shipping: [],
      ...(over === null
        ? {}
        : { warranty: { months: 3, scope: 'đường may', sourceId: 'pf:w', ...over } }),
    },
    stock: { disclose: 'status', lowAt: null },
  });
  const noProduct: TryKnowledge = {
    ...knowledge,
    matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
    lookupPlanProducts: async () => [],
    lookupProductFacts: async () => [],
  };
  const runDefect = async (
    text: string,
    factSlots: NonNullable<PipelineInput['factSlots']>,
    draft = draftOf('Về bảo hành: {fact:warranty}.'),
  ) => {
    const { drafter } = fakeDrafter(draft);
    const result = await runPipeline(
      { workspaceId: 'ws1', text, kbVersion: 'v1', voice, autoSendEnabled: true, factSlots },
      {
        extractor: createFixtureExtractor([
          {
            match: /./,
            result: { ...extractFor([text]), labels: [{ label: 'advice' }], topics: ['defect'] },
          },
        ]),
        drafter,
        knowledge: noProduct,
      },
    );
    if (result.status !== 'done') throw new Error('expected done');
    return result;
  };
  it('"Đường may bị bung thì có được bảo hành không shop" → answer + needsHuman + autoSendPolicy never; câu chỉ nêu phạm vi + thời hạn', async () => {
    const r = await runDefect(
      'Đường may bị bung thì có được bảo hành không shop',
      warrantyPolicy({}),
    );
    expect(r.decision).toMatchObject({
      action: 'answer',
      needsHuman: true,
      autoSendPolicy: 'never',
    });
    expect(r.reply).toBe('Về bảo hành: bảo hành đường may 3 tháng.');
    expect(r.riskReasons.review).toEqual(['defect_warranty_scope']);
  });
  it('LLM hứa đổi/hoàn khi không có chỗ giữ chỗ returns → từ chối cứng (concept), dùng câu dự phòng', async () => {
    const r = await runDefect(
      'Đường may bị bung thì có được bảo hành không shop',
      warrantyPolicy({}),
      draftOf('Về bảo hành: {fact:warranty}. Shop sẽ đổi hàng và hoàn tiền cho bạn.'),
    );
    expect(r.reply).not.toMatch(/đổi hàng|hoàn tiền/);
    expect(r.slotDiagnostics?.rejections?.[0]?.codes).toContain('concept');
    expect(r.decision.needsHuman).toBe(true);
  });
  it.each([
    ['Màu áo bị phai thì có bảo hành không shop', warrantyPolicy({})],
    ['Khóa kéo hỏng có bảo hành không shop', warrantyPolicy({})],
    ['Đường may bị bung thì có được bảo hành không shop', warrantyPolicy(null)],
    ['Đường may bị bung thì có được bảo hành không shop', warrantyPolicy({ scope: undefined })],
    [
      'Đường may bị bung thì có được bảo hành không shop',
      warrantyPolicy({ none: true, months: null }),
    ],
  ])('phạm vi không khớp / không có thẻ bảo hành → chuyển người: %s', async (text, slotsInput) => {
    const r = await runDefect(text, slotsInput);
    expect(r.decision.action).toBe('handoff');
    expect(r.reply).toBe('');
  });
});

describe('FR-140: bản nháp không dùng được KHÔNG được mang nhãn trả lời (mẫu en-07)', () => {
  const answerWith = async (draft: DraftResult, factSlots?: PipelineInput['factSlots']) => {
    const { drafter } = fakeDrafter(draft);
    const result = await runPipeline(
      {
        workspaceId: 'ws1',
        text: 'Tote bag giá bao nhiêu',
        kbVersion: 'v1',
        voice,
        autoSendEnabled: true,
        ...(factSlots ? { factSlots } : {}),
      },
      {
        extractor: createFixtureExtractor([{ match: /./, result: extractFor(['giá']) }]),
        drafter,
        knowledge,
      },
    );
    if (result.status !== 'done') throw new Error('expected done');
    return result;
  };
  it.each([
    [
      'needs_human (claim trỏ nguồn sai) + reply rỗng',
      { ...draftOf(''), needs_human: true, reason: 'claim_source' },
    ],
    ['reply rỗng dù needs_human false', draftOf('   ')],
    ['needs_human true dù có chữ', { ...draftOf('Giá 99.000đ ạ'), needs_human: true, reason: 'x' }],
  ])('%s → chuyển người, ghi lý do FR-140', async (_name, draft) => {
    const r = await answerWith(draft);
    expect(r.decision.action).toBe('handoff');
    expect(r.decision.reason).toBe('claim_unsupported');
    expect(r.reply).toBe('');
    expect(r.riskReasons.review).toContain('fr140_draft_unusable');
  });
  it('câu hợp lệ: không bị đổi, không ghi lý do', async () => {
    const r = await answerWith(draftOf('Túi tote canvas giá 99.000đ ạ'));
    expect(r.decision.action).not.toBe('handoff');
    expect(r.riskReasons.review).toBeUndefined();
  });
  it('đường chỗ giữ chỗ: câu đã được code điền thì không bị coi là rỗng', async () => {
    const r = await answerWith(
      draftOf('{fact:product_name.1} giá {fact:price.1}.'),
      slots([ship()]),
    );
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toBe('Túi tote canvas giá 99.000đ.');
  });
});

describe('sản phẩm được nhắc nhưng không có trong danh mục → đường cũ (redirect), không hỏi lại "sản phẩm nào" (viplain-24)', () => {
  const noProduct: TryKnowledge = {
    ...knowledge,
    matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
    lookupPlanProducts: async () => [],
    lookupProductFacts: async () => [],
  };
  const runAsk = async (text: string, ask: string, mentions: string[]) => {
    const { drafter } = fakeDrafter(draftOf('Sorry.'));
    const result = await runPipeline(
      {
        workspaceId: 'ws1',
        text,
        kbVersion: 'v1',
        voice,
        autoSendEnabled: true,
        factSlots: slots([ship()]),
      },
      {
        extractor: createFixtureExtractor([
          {
            match: /./,
            result: {
              ...extractFor([ask]),
              labels: [{ label: 'advice' }],
              topics: ['stock'],
              product_mentions: mentions,
            },
          },
        ]),
        drafter,
        knowledge: noProduct,
      },
    );
    if (result.status !== 'done') throw new Error('expected done');
    return result;
  };
  it('"shop có bán giày k" (nhắc "giày", danh mục không có) → redirect/topic_unsourced', async () => {
    const r = await runAsk('shop có bán giày k', 'còn hàng giày không', ['giày']);
    expect(r.decision.action).toBe('redirect');
    expect(r.decision.reason).toBe('topic_unsourced');
  });
  it('"how much?" (không nhắc sản phẩm nào) vẫn hỏi lại sản phẩm nào (clarify/product_unknown)', async () => {
    const r = await runAsk('how much?', 'how much', []);
    expect(r.decision.action).toBe('clarify');
    expect(r.decision.reason).toBe('product_unknown');
  });
});

describe('FR-140: needs_human ở redirect/clarify là bình thường (không bị đổi thành chuyển người)', () => {
  it('redirect có câu mời + needs_human true → giữ redirect, giữ câu', async () => {
    const { drafter } = fakeDrafter({
      ...draftOf('Bạn ơi, shop chưa có thông tin về khuyến mãi. Bạn ib shop nhé.'),
      needs_human: true,
      reason: 'redirect',
    });
    const result = await runPipeline(
      {
        workspaceId: 'ws1',
        text: 'Mua 2 cái có giảm k shop',
        kbVersion: 'v1',
        voice,
        autoSendEnabled: true,
      },
      {
        extractor: createFixtureExtractor([
          {
            match: /./,
            result: {
              ...extractFor(['mua 2 cái có giảm giá không']),
              labels: [{ label: 'advice' }],
            },
          },
        ]),
        drafter,
        knowledge: {
          ...knowledge,
          matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
        },
      },
    );
    if (result.status !== 'done') throw new Error('expected done');
    expect(result.decision.action).toBe('redirect');
    expect(result.reply).toContain('ib shop');
    expect(result.riskReasons.review).toBeUndefined();
  });
});

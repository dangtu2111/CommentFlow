import { describe, expect, it } from 'vitest';
import {
  type CaptureInput,
  captureAnswerExample,
  EXAMPLE_CAP,
  type ExamplesDeps,
  pickVoiceExamples,
  setExampleStatus,
} from './answer-examples';
import { createInMemoryExampleStore } from './example-store';
import { EXAMPLE_REJECT, type ExampleVariant } from './example-template';

const WS = 'ws-a';
const WS_B = 'ws-b';
const V1: ExampleVariant = { id: 'v-1', priceVnd: 150000, stock: 7 };

function setup(variants: readonly ExampleVariant[] = [V1]) {
  const store = createInMemoryExampleStore();
  let n = 0;
  let clock = 0;
  const deps: ExamplesDeps = {
    store,
    newId: () => `ex-${++n}`,
    now: () => new Date(1_700_000_000_000 + ++clock * 1000),
    loadVariants: async () => variants,
  };
  return { store, deps };
}

const base = (over: Partial<CaptureInput> = {}): CaptureInput => ({
  workspaceId: WS,
  channelId: null,
  label: 'price',
  lang: 'vi',
  question: 'Áo này giá sao shop? sdt 0912345678',
  answer: 'Dạ áo này 150k, còn 7 cái ạ',
  source: 'staff_edited',
  sourceDraftId: null,
  approvedBy: 'user-1',
  variants: [V1],
  ...over,
});

describe('FR-132 captureAnswerExample', () => {
  it('lưu mẫu: câu hỏi đã che PII, đáp án có placeholder', async () => {
    const { store, deps } = setup();
    const r = await captureAnswerExample(base(), deps);
    expect(r).toEqual({ ok: true, id: 'ex-1' });
    const [row] = await store.list(WS);
    expect(row).toMatchObject({
      questionMasked: 'Áo này giá sao shop? sdt [sđt]',
      answerTemplate: 'Dạ áo này {price:v-1}, còn {stock:v-1} cái ạ',
      variantIds: ['v-1'],
      status: 'active',
      usedCount: 0,
      workspaceId: WS,
    });
    expect(JSON.stringify(row)).not.toContain('0912345678');
  });

  it('nhận cả nguyên văn; từ chối câu AI tự gửi', async () => {
    const { deps } = setup();
    expect((await captureAnswerExample(base({ source: 'staff_verbatim' }), deps)).ok).toBe(true);
    const auto = await captureAnswerExample(base({ source: 'ai_auto' as never }), deps);
    expect(auto).toEqual({ ok: false, code: 'EXAMPLE_INVALID_INPUT' });
  });

  it('từ chối đầu vào sai nhãn/ngôn ngữ/quá dài', async () => {
    const { deps } = setup();
    for (const bad of [
      base({ label: 'x' as never }),
      base({ lang: 'fr' as never }),
      base({ answer: 'a'.repeat(2001) }),
    ]) {
      expect(await captureAnswerExample(bad, deps)).toEqual({
        ok: false,
        code: 'EXAMPLE_INVALID_INPUT',
      });
    }
  });

  it('chuyển mã từ chối của mẫu không an toàn, không lưu gì', async () => {
    const { store, deps } = setup();
    const r = await captureAnswerExample(base({ answer: 'Giá 999k nha' }), deps);
    expect(r).toEqual({ ok: false, code: EXAMPLE_REJECT.MONEY });
    expect(await store.list(WS)).toHaveLength(0);
  });

  it('bỏ mẫu trùng (cùng nhãn, ngôn ngữ, kênh, đáp án) đang bật', async () => {
    const { store, deps } = setup();
    await captureAnswerExample(base(), deps);
    const again = await captureAnswerExample(base(), deps);
    expect(again).toEqual({ ok: false, code: 'EXAMPLE_DUPLICATE' });
    expect(await store.list(WS)).toHaveLength(1);
    // khác workspace thì không trùng
    expect((await captureAnswerExample(base({ workspaceId: WS_B }), deps)).ok).toBe(true);
  });

  it('trần 2.000 mẫu: bỏ mẫu ít dùng + cũ nhất, giữ mẫu mới', async () => {
    const { store, deps } = setup();
    for (let i = 0; i < EXAMPLE_CAP; i++) {
      await store.insert({
        id: `old-${i}`,
        workspaceId: WS,
        channelId: null,
        label: 'other',
        lang: 'vi',
        questionMasked: 'q',
        answerTemplate: `a${i}`,
        variantIds: [],
        sourceDraftId: null,
        approvedBy: 'u',
        status: 'active',
        usedCount: i === 0 ? 5 : 0,
        createdAt: new Date(1_000 + i),
      });
    }
    const r = await captureAnswerExample(base(), deps);
    expect(r.ok).toBe(true);
    const rows = await store.list(WS);
    expect(rows).toHaveLength(EXAMPLE_CAP);
    expect(rows.some((x) => x.id === 'ex-1')).toBe(true); // mẫu mới còn
    expect(rows.some((x) => x.id === 'old-0')).toBe(true); // dùng nhiều còn
    expect(rows.some((x) => x.id === 'old-1')).toBe(false); // ít dùng + cũ nhất bị bỏ
  });
});

describe('FR-132 pickVoiceExamples', () => {
  async function seed(deps: ExamplesDeps, answers: string[], over: Partial<CaptureInput> = {}) {
    for (const answer of answers) {
      await captureAnswerExample(base({ answer, ...over }), deps);
    }
  }

  it('lấy tối đa 3 mẫu mới nhất, điền giá/tồn hiện tại', async () => {
    const { deps } = setup([{ ...V1, priceVnd: 170000, stock: 2 }]);
    // lưu bằng biến thể cũ rồi đổi giá hiện tại
    const store = deps.store;
    await captureAnswerExample(base({ answer: 'Dạ 1 150k ạ' }), { ...deps });
    await captureAnswerExample(base({ answer: 'Dạ 2 150k ạ' }), deps);
    await captureAnswerExample(base({ answer: 'Dạ 3 150k ạ' }), deps);
    await captureAnswerExample(base({ answer: 'Dạ 4 150k ạ' }), deps);
    const out = await pickVoiceExamples(
      { workspaceId: WS, channelId: null, label: 'price', lang: 'vi' },
      deps,
    );
    expect(out.map((e) => e.answer)).toEqual([
      'Dạ 4 170.000đ ạ',
      'Dạ 3 170.000đ ạ',
      'Dạ 2 170.000đ ạ',
    ]);
    expect(out[0]?.question).toBe('Áo này giá sao shop? sdt [sđt]');
    const rows = await store.list(WS);
    expect(rows.filter((r) => r.usedCount === 1)).toHaveLength(3);
  });

  it('lọc theo nhãn, ngôn ngữ, workspace, kênh; kênh null dùng cho mọi kênh', async () => {
    const { deps } = setup();
    await seed(deps, ['Dạ a'], { label: 'price' });
    await seed(deps, ['Dạ b'], { label: 'advice' });
    await seed(deps, ['Dạ c'], { lang: 'en' });
    await seed(deps, ['Dạ d'], { workspaceId: WS_B });
    await seed(deps, ['Dạ e'], { channelId: 'ch-1' });
    await seed(deps, ['Dạ f'], { channelId: 'ch-2' });
    const out = await pickVoiceExamples(
      { workspaceId: WS, channelId: 'ch-1', label: 'price', lang: 'vi' },
      deps,
    );
    expect(out.map((e) => e.answer).sort()).toEqual(['Dạ a', 'Dạ e']);
  });

  it('bỏ mẫu bị tắt; mẫu thiếu biến thể thì lùi sang mẫu kế', async () => {
    const { deps } = setup();
    await seed(deps, ['Dạ cũ'], {});
    await captureAnswerExample(base({ answer: 'Giá 150k nè' }), deps);
    await captureAnswerExample(base({ answer: 'Dạ tắt' }), deps);
    const rows = await deps.store.list(WS);
    const off = rows.find((r) => r.answerTemplate === 'Dạ tắt');
    expect(await setExampleStatus(WS, off?.id as string, 'disabled', deps)).toBe(true);
    const noVariants: ExamplesDeps = { ...deps, loadVariants: async () => [] };
    const out = await pickVoiceExamples(
      { workspaceId: WS, channelId: null, label: 'price', lang: 'vi' },
      noVariants,
    );
    expect(out.map((e) => e.answer)).toEqual(['Dạ cũ']);
  });

  it('không có mẫu → mảng rỗng, không tăng used_count', async () => {
    const { deps } = setup();
    expect(
      await pickVoiceExamples(
        { workspaceId: WS, channelId: null, label: 'spam', lang: 'en' },
        deps,
      ),
    ).toEqual([]);
  });
});

describe('FR-132 setExampleStatus', () => {
  it('chỉ đổi mẫu của đúng workspace (workspace khác → false)', async () => {
    const { store, deps } = setup();
    await captureAnswerExample(base(), deps);
    expect(await setExampleStatus(WS_B, 'ex-1', 'disabled', deps)).toBe(false);
    expect((await store.list(WS))[0]?.status).toBe('active');
    expect(await setExampleStatus(WS, 'ex-1', 'disabled', deps)).toBe(true);
    expect((await store.list(WS))[0]?.status).toBe('disabled');
  });
});

import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { LlmCallInput, LlmCallResult, LlmClient } from '../llm-client';
import {
  createLlmDistiller,
  DISTILL_PROMPT_VERSION,
  DISTILL_PROMPT_VERSIONS,
  DISTILL_STEP,
  type Distiller,
  parseDistillPromptVersion,
} from './distiller';
import { type DistillChunk, type DistillOps, runKbDistill } from './run-distill';
import { parseDistillItems } from './schema';
import { digitGroups, verifyDistillItem } from './verify';

/** M3-2a: kiểm cứng, trần chi phí, chạy một lần mỗi bản nội dung. LLM giả cắm qua tham số (test tự động). */
const SOURCE =
  'Áo thun làm từ cotton 100%, xuất xứ Việt Nam.\nGiặt máy ở nhiệt độ dưới 30 độ. Phí ship 30.000đ toàn quốc.';

const item = (over: Partial<Parameters<typeof verifyDistillItem>[0]> = {}) => ({
  kind: 'product_attr' as const,
  question: 'Áo làm từ chất liệu gì?',
  answer: 'Áo làm từ cotton 100%.',
  evidenceQuote: 'Áo thun làm từ cotton 100%, xuất xứ Việt Nam.',
  ...over,
});

describe('verifyDistillItem — kiểm cứng bằng code', () => {
  it('đạt: trích nguyên văn, mọi chữ số có trong trích dẫn', () => {
    expect(verifyDistillItem(item(), SOURCE)).toBeNull();
  });

  it('chỉ khác khoảng trắng/xuống dòng vẫn tính nguyên văn', () => {
    const quote = 'Giặt máy ở nhiệt độ   dưới 30 độ.';
    expect(
      verifyDistillItem(
        item({ question: 'Giặt thế nào?', answer: 'Giặt máy dưới 30 độ.', evidenceQuote: quote }),
        SOURCE,
      ),
    ).toBeNull();
  });

  it('trích dẫn không có trong nguồn (bịa/diễn đạt lại) → quote_not_in_source', () => {
    expect(
      verifyDistillItem(item({ evidenceQuote: 'Áo làm bằng cotton nguyên chất 100%' }), SOURCE),
    ).toBe('quote_not_in_source');
  });

  it('chữ số trong câu đáp không có trong trích dẫn → digit_not_in_quote', () => {
    expect(verifyDistillItem(item({ answer: 'Áo cotton 100%, bảo hành 12 tháng.' }), SOURCE)).toBe(
      'digit_not_in_quote',
    );
  });

  it('số tiền (kể cả có trong nguồn) bị loại: giá chỉ lấy từ products', () => {
    expect(
      verifyDistillItem(
        item({
          question: 'Phí ship bao nhiêu?',
          answer: 'Phí ship 30.000đ toàn quốc.',
          evidenceQuote: 'Phí ship 30.000đ toàn quốc.',
        }),
        SOURCE,
      ),
    ).toBe('money_in_answer');
  });

  it('chỗ giữ chỗ {fact:…}/{src:…} do model viết bị loại', () => {
    expect(verifyDistillItem(item({ answer: 'Áo {fact:price} cotton 100%' }), SOURCE)).toBe(
      'placeholder_in_text',
    );
  });

  it('digitGroups gộp dấu ngăn nghìn', () => {
    expect(digitGroups('30.000đ và 1,500 và 7 ngày')).toEqual(['30000', '1500', '7']);
  });
});

describe('parseDistillItems', () => {
  it('JSON hỏng/không có items → null; mục sai cấu trúc được đếm riêng', () => {
    expect(parseDistillItems('không phải json')).toBeNull();
    expect(parseDistillItems('{"x":1}')).toBeNull();
    const parsed = parseDistillItems(
      JSON.stringify({ items: [item(), { kind: 'faq', question: 'a' }] }),
    );
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.malformed).toBe(1);
  });
});

const fakeOps = (chunks: DistillChunk[]) => {
  const state = { drafts: [] as unknown[], marked: [] as string[], listed: 0 };
  const ops: DistillOps = {
    listChunks: async (limit) => {
      state.listed = limit;
      return chunks.filter((c) => !state.marked.includes(c.id));
    },
    insertDrafts: async (items) => {
      state.drafts.push(...items);
      return items.length;
    },
    markDistilled: async (done) => {
      state.marked.push(...done.map((d) => d.id));
    },
  };
  return { ops, state };
};
const chunk = (id: string, content = SOURCE): DistillChunk => ({
  id,
  content,
  contentHash: `h-${id}`,
});

describe('runKbDistill', () => {
  it('chỉ mục đạt kiểm cứng vào nháp; đếm số bị loại theo lý do; đoạn xong được đánh dấu', async () => {
    const distiller: Distiller = {
      distill: async () => ({
        items: [item(), item({ evidenceQuote: 'câu không có trong nguồn đâu nhé' })],
        malformed: 0,
        costUsd: 0.01,
      }),
    };
    const { ops, state } = fakeOps([chunk('c1')]);
    const stats = await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(stats).toMatchObject({ considered: 1, called: 1, accepted: 1, inserted: 1 });
    expect(stats.rejected).toEqual({ quote_not_in_source: 1 });
    expect(state.drafts).toMatchObject([{ kind: 'product_attr', sourceChunkId: 'c1', lang: 'vi' }]);
    expect(state.marked).toEqual(['c1']);
  });

  it('chạy lại khi đã đánh dấu → không gọi LLM nữa (một lần mỗi bản nội dung)', async () => {
    let calls = 0;
    const distiller: Distiller = {
      distill: async () => {
        calls += 1;
        return { items: [], malformed: 0, costUsd: 0.001 };
      },
    };
    const { ops } = fakeOps([chunk('c1'), chunk('c2')]);
    await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(calls).toBe(2);
    await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(calls).toBe(2);
  });

  it('vượt trần chi phí → dừng, đoạn còn lại chưa đánh dấu để lần sau', async () => {
    const distiller: Distiller = {
      distill: async () => ({ items: [], malformed: 0, costUsd: 0.12 }),
    };
    const { ops, state } = fakeOps([chunk('c1'), chunk('c2'), chunk('c3')]);
    const stats = await runKbDistill({ workspaceId: 'w', distiller, ops, costCapUsd: 0.2 });
    expect(stats.stoppedByCap).toBe(true);
    expect(stats.called).toBe(2);
    expect(state.marked).toEqual(['c1', 'c2']);
  });

  it('đầu ra không đọc được → đếm invalidOutput, đoạn KHÔNG đánh dấu (thử lại lần sau); PII bị che trước khi gửi', async () => {
    const seen: string[] = [];
    const distiller: Distiller = {
      distill: async ({ text }) => {
        seen.push(text);
        return { items: null, malformed: 0, costUsd: 0 };
      },
    };
    const { ops, state } = fakeOps([chunk('c1', 'Liên hệ 0912345678 hoặc a@b.vn')]);
    const stats = await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(stats.invalidOutput).toBe(1);
    expect(state.marked).toEqual([]);
    expect(seen[0]).not.toMatch(/0912345678|a@b\.vn/);
  });

  it('lỗi gọi LLM được ném nguyên, không ghi gì', async () => {
    const distiller: Distiller = {
      distill: async () => {
        throw new Error('LLM_UNAVAILABLE');
      },
    };
    const { ops, state } = fakeOps([chunk('c1')]);
    await expect(runKbDistill({ workspaceId: 'w', distiller, ops })).rejects.toThrow(
      'LLM_UNAVAILABLE',
    );
    expect(state.drafts).toEqual([]);
    expect(state.marked).toEqual([]);
  });
});

describe('createLlmDistiller — gọi LLM qua LlmClient', () => {
  const fakeLlm = (text: string, costUsd = 0.001) => {
    const calls: LlmCallInput[] = [];
    const llm = {
      call: async (input: LlmCallInput) => {
        calls.push(input);
        return { text, costUsd } as LlmCallResult;
      },
    } as LlmClient;
    return { llm, calls };
  };
  const text = unsafeMarkMasked(SOURCE);

  it('một lần gọi, đúng bước/prompt_version, nhiệt độ 0; trả mục đã phân tích và chi phí', async () => {
    const out = JSON.stringify({ items: [item()] });
    const { llm, calls } = fakeLlm(out);
    const result = await createLlmDistiller({ llm, model: 'm', seed: 7 }).distill({
      workspaceId: 'ws1',
      text,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      step: DISTILL_STEP,
      promptVersion: DISTILL_PROMPT_VERSION,
      temperature: 0,
      seed: 7,
      model: 'm',
    });
    expect(result.items).toHaveLength(1);
    expect(result.costUsd).toBe(0.001);
  });

  it('không truyền seed khi không đặt; đầu ra không đọc được → items null', async () => {
    const { llm, calls } = fakeLlm('không phải JSON');
    const result = await createLlmDistiller({ llm, model: 'm' }).distill({
      workspaceId: 'ws1',
      text,
    });
    expect(calls[0]).not.toHaveProperty('seed');
    expect(result.items).toBeNull();
    expect(result.malformed).toBe(0);
  });
});

/** KB-SHOP-V2 PR5: mục `shop_field` (tên/khẩu hiệu/mô tả/địa chỉ/giờ/pháp lý) và liên hệ do CODE tách — đều thành ĐỀ XUẤT, không thành FAQ. */
const SHOP_SOURCE =
  'Cửa hàng Áo Đẹp, địa chỉ 12 Lê Lợi, Quận 1.\nMở cửa từ 8h đến 21h hằng ngày.\nHotline: 0901234567. Email: cskh@aodep.vn.\nMã số thuế 0312345678. Giá áo từ 199k.';
const shopItem = (over: Record<string, unknown> = {}) => ({
  kind: 'shop_field' as const,
  field: 'address' as const,
  question: 'address',
  answer: '12 Lê Lợi, Quận 1',
  evidenceQuote: 'địa chỉ 12 Lê Lợi, Quận 1.',
  ...over,
});

describe('shop_field — kiểm cứng', () => {
  it('đạt: trích nguyên văn, chữ số có trong trích dẫn', () => {
    expect(verifyDistillItem(shopItem(), SHOP_SOURCE)).toBeNull();
  });

  it('thiếu trường, trường ngoài danh sách LLM được phép, hoặc giá trị có số tiền → invalid_shop_field', () => {
    expect(verifyDistillItem(shopItem({ field: undefined }), SHOP_SOURCE)).toBe(
      'invalid_shop_field',
    );
    expect(verifyDistillItem(shopItem({ field: 'hotline' }), SHOP_SOURCE)).toBe(
      'invalid_shop_field',
    );
    expect(
      verifyDistillItem(
        shopItem({
          field: 'description',
          answer: 'Giá áo từ 199k',
          evidenceQuote: 'Giá áo từ 199k.',
        }),
        SHOP_SOURCE,
      ),
    ).toBe('money_in_answer');
  });

  it('chữ số bịa (không có trong trích dẫn) hoặc trích dẫn không có trong nguồn vẫn bị loại', () => {
    expect(verifyDistillItem(shopItem({ answer: '99 Lê Lợi, Quận 1' }), SHOP_SOURCE)).toBe(
      'digit_not_in_quote',
    );
    expect(verifyDistillItem(shopItem({ evidenceQuote: 'địa chỉ ở đâu đó' }), SHOP_SOURCE)).toBe(
      'quote_not_in_source',
    );
  });
});

describe('parseDistillItems — shop_field', () => {
  it('nhận mục shop_field có field; field "none" cho faq được chấp nhận; shop_field thiếu field là mục sai cấu trúc', () => {
    const parsed = parseDistillItems(
      JSON.stringify({
        items: [
          shopItem(),
          { ...item(), field: 'none' },
          { ...shopItem(), field: 'none' },
          { ...shopItem(), field: 'bogus' },
        ],
      }),
    );
    expect(parsed?.items.map((i) => i.kind)).toEqual(['shop_field', 'product_attr']);
    expect(parsed?.malformed).toBe(2);
  });
});

describe('runKbDistill — đề xuất thông tin shop', () => {
  const withShopOps = (chunks: DistillChunk[]) => {
    const { ops, state } = fakeOps(chunks);
    const saved: Array<Record<string, unknown>> = [];
    ops.saveShopSuggestions = async (items) => {
      saved.push(...(items as unknown as Array<Record<string, unknown>>));
      return items.length;
    };
    return { ops, state, saved };
  };
  const shopChunk = (id: string, title = 'Giới thiệu'): DistillChunk => ({
    ...chunk(id, SHOP_SOURCE),
    title,
  });

  it('mục shop_field đạt → đề xuất (không vào FAQ); liên hệ tách bằng regex trên văn bản GỐC (không gửi LLM); kèm tiêu đề nguồn', async () => {
    const seen: string[] = [];
    const distiller: Distiller = {
      distill: async ({ text }) => {
        seen.push(text);
        return {
          items: [shopItem(), item({ evidenceQuote: 'câu bịa không có trong nguồn' })],
          malformed: 0,
          costUsd: 0.01,
        };
      },
    };
    const { ops, state, saved } = withShopOps([shopChunk('c1')]);
    const stats = await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(state.drafts).toEqual([]); // không có FAQ
    expect(stats).toMatchObject({ shopFieldsAccepted: 1, shopSuggested: 3 });
    const byField = Object.fromEntries(saved.map((x) => [x.field, x]));
    expect(byField.address).toMatchObject({
      value: '12 Lê Lợi, Quận 1',
      source: 'kb_text',
      sourceRef: 'Giới thiệu',
      evidenceQuote: 'địa chỉ 12 Lê Lợi, Quận 1.',
    });
    expect(byField.hotline).toMatchObject({ value: '0901234567' });
    expect(byField.email).toMatchObject({ value: 'cskh@aodep.vn' });
    // Gửi LLM là bản đã che PII; regex chạy trên bản gốc nên vẫn thấy số.
    expect(seen[0]).not.toMatch(/0901234567|cskh@aodep\.vn/);
  });

  it('cùng một trường ở nhiều đoạn: giữ lần gặp đầu tiên trong lượt chạy', async () => {
    const distiller: Distiller = {
      distill: async () => ({ items: [], malformed: 0, costUsd: 0 }),
    };
    const { ops, saved } = withShopOps([
      { ...chunk('c1', 'Hotline 0901234567'), title: 'A' },
      { ...chunk('c2', 'Hotline 0912345678'), title: 'B' },
    ]);
    await runKbDistill({ workspaceId: 'w', distiller, ops });
    const hotlines = saved.filter((x) => x.field === 'hotline');
    expect(hotlines).toHaveLength(1);
    expect(hotlines[0]).toMatchObject({ value: '0901234567', sourceRef: 'A' });
  });

  it('không có bước lưu đề xuất → bỏ qua, không lỗi; shop_field vẫn không vào FAQ', async () => {
    const distiller: Distiller = {
      distill: async () => ({ items: [shopItem()], malformed: 0, costUsd: 0 }),
    };
    const { ops, state } = fakeOps([shopChunk('c1')]);
    const stats = await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(state.drafts).toEqual([]);
    expect(stats.shopSuggested).toBe(0);
  });
});

/** A/B prompt chắt lọc (12/11/2026): giữ nguyên bản `distill@1` làm hằng số để đo cùng điều kiện với `distill@2`. */
describe('prompt chắt lọc A/B', () => {
  const fakeLlm = () => {
    const calls: LlmCallInput[] = [];
    const llm = {
      call: async (input: LlmCallInput) => {
        calls.push(input);
        return { text: JSON.stringify({ items: [item()] }), costUsd: 0.001 } as LlmCallResult;
      },
    } as LlmClient;
    return { llm, calls };
  };
  const text = unsafeMarkMasked(SOURCE);
  const systemOf = (call: LlmCallInput | undefined) =>
    String(call?.messages.find((m) => m.role === 'system')?.content ?? '');
  const itemSchemaOf = (call: LlmCallInput | undefined) => {
    const schema = call?.responseFormat?.schema;
    if (!schema) throw new Error('thiếu responseFormat');
    return (
      schema as {
        properties: {
          items: { items: { required: string[]; properties: Record<string, unknown> } };
        };
      }
    ).properties.items.items;
  };

  it('có đúng hai bản; mặc định là bản mới nhất; chuỗi lạ bị từ chối', () => {
    expect(DISTILL_PROMPT_VERSIONS).toEqual(['distill@1', 'distill@2']);
    expect(DISTILL_PROMPT_VERSION).toBe('distill@2');
    expect(parseDistillPromptVersion('distill@1')).toBe('distill@1');
    expect(parseDistillPromptVersion('distill@2')).toBe('distill@2');
    expect(parseDistillPromptVersion('distill@3')).toBeNull();
    expect(parseDistillPromptVersion('')).toBeNull();
  });

  it('distill@1: đúng prompt cũ (không nhắc shop_field), schema cũ không có field; ghi đúng prompt_version', async () => {
    const { llm, calls } = fakeLlm();
    await createLlmDistiller({ llm, model: 'm', promptVersion: 'distill@1' }).distill({
      workspaceId: 'ws1',
      text,
    });
    expect(calls[0]?.promptVersion).toBe('distill@1');
    expect(systemOf(calls[0])).not.toContain('shop_field');
    expect(systemOf(calls[0])).toContain('product_attr');
    const schema = itemSchemaOf(calls[0]);
    expect(schema.required).toEqual(['kind', 'question', 'answer', 'evidenceQuote']);
    expect(schema.properties).not.toHaveProperty('field');
  });

  it('distill@2 (mặc định): nhắc shop_field, schema có field; vẫn còn product_attr trong cả prompt lẫn schema', async () => {
    const { llm, calls } = fakeLlm();
    await createLlmDistiller({ llm, model: 'm' }).distill({ workspaceId: 'ws1', text });
    expect(calls[0]?.promptVersion).toBe('distill@2');
    expect(systemOf(calls[0])).toContain('shop_field');
    expect(systemOf(calls[0])).toContain('product_attr');
    const schema = itemSchemaOf(calls[0]);
    expect(schema.required).toContain('field');
    expect((schema.properties.kind as { enum: string[] }).enum).toEqual([
      'faq',
      'product_attr',
      'shop_field',
    ]);
  });
});

describe('runKbDistill — số mục đạt theo loại', () => {
  it('acceptedByKind đếm faq / product_attr / shop_field', async () => {
    const distiller: Distiller = {
      distill: async () => ({
        items: [
          item({ kind: 'faq' }),
          item({ kind: 'product_attr' }),
          item({ kind: 'product_attr' }),
        ],
        malformed: 0,
        costUsd: 0,
      }),
    };
    const { ops } = fakeOps([chunk('c1')]);
    const stats = await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(stats.acceptedByKind).toEqual({ faq: 1, product_attr: 2, shop_field: 0 });
  });
});

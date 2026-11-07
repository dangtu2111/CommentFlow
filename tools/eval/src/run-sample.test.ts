import {
  createAbbreviationDict,
  createDemoDrafter,
  createDemoExtractor,
  createDemoKnowledge,
  DEMO_ABBREVIATIONS,
  EXTRACT_UNREADABLE_MESSAGE,
  type Extractor,
} from '@flow/ai';
import { AppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { EvalSample } from './dataset';
import type { UsageRecord } from './recording-llm';
import { type RunContext, runSample } from './run-sample';

const sample = (text: string, over: Partial<EvalSample> = {}): EvalSample => ({
  id: 's1',
  source: 'synthetic',
  group: 'vi',
  category: 'normal',
  text,
  hasMedia: false,
  expected: {
    lang: 'vi',
    label: 'price',
    action: 'answer',
    extract: {},
    mustContain: [],
    forbidden: [],
  },
  ...over,
});

const context = (
  build: RunContext['build'] = () => ({
    extractor: createDemoExtractor(),
    drafter: createDemoDrafter(),
  }),
): RunContext => ({
  knowledge: createDemoKnowledge(),
  voice: { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' },
  dict: createAbbreviationDict(DEMO_ABBREVIATIONS),
  build,
});

describe('EVAL-RUNNER chạy một mẫu qua pipeline', () => {
  it('trả kết quả đủ: nhãn, hành động, câu trả lời, mã vi phạm và snapshot extract', async () => {
    const outcome = await runSample(
      sample('Áo thun basic size M màu đen giá bao nhiêu ạ?'),
      context(),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.label).toBe('price');
    expect(outcome.extract).toMatchObject({ size: 'M', color: 'đen' });
    expect(outcome.extract?.product_mentions.length).toBeGreaterThan(0);
    expect(Array.isArray(outcome.replyViolations)).toBe(true);
    expect(outcome.rewriteSource).toBeNull();
    expect(outcome.searchQuery).not.toBe('');
  });

  it('câu chỉ có biểu tượng bị lọc quy tắc → ok:false, errorKind skipped, không tốn lượt gọi', async () => {
    const outcome = await runSample(sample('😍😍'), context());
    expect(outcome).toMatchObject({ ok: false, errorKind: 'skipped', usage: [] });
  });

  it('usage ghi được lần gọi LLM của bước dựng; trả về cho báo cáo chi phí', async () => {
    const record: UsageRecord = {
      step: 'extract',
      model: 'm',
      inputTokens: 1,
      outputTokens: 1,
      cachedTokens: 0,
      reasoningTokens: 0,
      costUsd: 0.001,
    };
    const outcome = await runSample(
      sample('Áo thun basic giá bao nhiêu?'),
      context((sink) => {
        sink.push(record);
        return { extractor: createDemoExtractor(), drafter: createDemoDrafter() };
      }),
    );
    expect(outcome.usage).toEqual([record]);
  });

  it('AI trả JSON hỏng → invalid_output (kèm mã chung, không có nội dung khách)', async () => {
    const broken: Extractor = {
      async extract() {
        throw new AppError('LLM_UNAVAILABLE', EXTRACT_UNREADABLE_MESSAGE);
      },
    };
    const outcome = await runSample(
      sample('bí mật 0901234567 giá bao nhiêu'),
      context(() => ({ extractor: broken, drafter: createDemoDrafter() })),
    );
    expect(outcome).toMatchObject({ ok: false, errorKind: 'invalid_output' });
    expect(JSON.stringify(outcome)).not.toContain('0901234567');
    expect(JSON.stringify(outcome)).toContain('LLM_UNAVAILABLE');
  });

  it('chạm trần chi phí (kể cả khi LlmClient bọc lỗi, chỉ còn tên ở cause) → limit; lỗi khác → error', async () => {
    const wrapped: Extractor = {
      async extract() {
        throw new AppError('LLM_UNAVAILABLE', 'Không kết nối được dịch vụ AI.', {
          cause: new Error('SpendLimitError'),
        });
      },
    };
    expect(
      await runSample(
        sample('giá bao nhiêu'),
        context(() => ({ extractor: wrapped, drafter: createDemoDrafter() })),
      ),
    ).toMatchObject({ errorKind: 'limit' });
    const plain: Extractor = {
      async extract() {
        throw new Error('hỏng 0901234567');
      },
    };
    const outcome = await runSample(
      sample('giá bao nhiêu'),
      context(() => ({ extractor: plain, drafter: createDemoDrafter() })),
    );
    expect(outcome).toMatchObject({ ok: false, errorKind: 'error', detail: 'Error' });
    expect(JSON.stringify(outcome)).not.toContain('0901234567');
  });

  it('variantCount và workspaceId được truyền cho pipeline mà không làm hỏng', async () => {
    const outcome = await runSample(sample('Áo thun basic giá bao nhiêu?'), {
      ...context(),
      variantCount: 2,
      workspaceId: '00000000-0000-4000-8000-000000000002',
    });
    expect(outcome.ok).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseDataset } from './dataset';
import { createProvider } from './promptfoo-entry';
import { buildPromptfooTests, renderTests } from './promptfoo-tests';
import { recordUsage, type UsageRecord } from './recording-llm';
import { createRunner, runAll } from './runner';
import { shopFixtureSchema } from './shop';

const shop = shopFixtureSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, '../datasets/shops/demo-shop.json'), 'utf8')),
);
const samples = parseDataset(
  readFileSync(resolve(__dirname, '../datasets/synthetic-demo.jsonl'), 'utf8'),
);
const base = {
  models: { classify: 'cf-classify', rewrite: 'cf-classify', draft: 'cf-draft' },
  shop,
};

describe('EVAL-RUNNER bộ chạy theo backend', () => {
  it('mock: không mạng, chạy hết bộ mẫu, chi phí 0, spent() = null', async () => {
    const runner = createRunner({ ...base, backend: 'mock', env: {} });
    const outcomes = await runAll(samples.slice(0, 8), runner, 3);
    expect(outcomes.size).toBe(8);
    for (const outcome of outcomes.values()) expect(outcome.usage).toEqual([]);
  });

  it('runAll giữ thứ tự mẫu, báo tiến độ, tôn trọng mức song song và chịu mức song song vô lý', async () => {
    let running = 0;
    let peak = 0;
    const runner = {
      run: vi.fn(async (sample: { id: string }) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolveWait) => setTimeout(resolveWait, 5));
        running -= 1;
        return { ok: false as const, id: sample.id, errorKind: 'skipped' as const, usage: [] };
      }),
      spent: () => null,
    };
    const progress: number[] = [];
    const outcomes = await runAll(samples.slice(0, 7), runner as never, 2, (done) =>
      progress.push(done),
    );
    expect([...outcomes.keys()]).toEqual(samples.slice(0, 7).map((s) => s.id));
    expect(peak).toBeLessThanOrEqual(2);
    expect(progress.at(-1)).toBe(7);
    expect((await runAll(samples.slice(0, 2), runner as never, 0)).size).toBe(2);
  });

  it('litellm thiếu biến môi trường → lỗi rõ ràng, không đoán', () => {
    expect(() => createRunner({ ...base, backend: 'litellm', env: {} })).toThrow(
      'LITELLM_BASE_URL',
    );
    expect(() =>
      createRunner({ ...base, backend: 'litellm', env: { LITELLM_BASE_URL: 'http://x' } }),
    ).toThrow('LITELLM_API_KEY');
  });
});

describe('EVAL-RUNNER ghi usage', () => {
  it('mỗi lần gọi thành công thêm một dòng usage; lỗi được ném nguyên và không ghi', async () => {
    const sink: UsageRecord[] = [];
    const inner = {
      call: vi.fn(async () => ({
        text: '{}',
        model: 'gpt-5-nano',
        inputTokens: 10,
        outputTokens: 5,
        cachedTokens: 2,
        reasoningTokens: 0,
        costUsd: 0.0001,
        cacheHit: false,
        usageId: 'u',
      })),
    };
    const llm = recordUsage(inner as never, sink);
    await llm.call({ step: 'extract' } as never);
    expect(sink).toEqual([
      {
        step: 'extract',
        model: 'gpt-5-nano',
        inputTokens: 10,
        outputTokens: 5,
        cachedTokens: 2,
        reasoningTokens: 0,
        costUsd: 0.0001,
      },
    ]);
    inner.call.mockRejectedValueOnce(new Error('hỏng'));
    await expect(llm.call({ step: 'draft' } as never)).rejects.toThrow('hỏng');
    expect(sink).toHaveLength(1);
  });
});

describe('EVAL-RUNNER lớp nối promptfoo', () => {
  it('mỗi mẫu một test, assert chỉ gồm kiểm tra áp dụng, metric có tên', () => {
    const tests = buildPromptfooTests(samples);
    expect(tests).toHaveLength(56);
    const full = tests.find((t) => t.description.includes('price-full'));
    const metrics = full?.assert.map((a) => a.metric) ?? [];
    expect(metrics).toEqual(
      expect.arrayContaining([
        'label',
        'action',
        'facts',
        'extract_product_mentions',
        'extract_size',
        'extract_color',
      ]),
    );
    expect(metrics).not.toContain('safety');
    expect(
      tests.find((t) => t.description.includes('injection'))?.assert.map((a) => a.metric),
    ).toContain('safety');
    expect(
      tests.find((t) => t.description.includes('shipping'))?.assert.map((a) => a.metric),
    ).not.toContain('extract_size');
    expect(JSON.parse(String(full?.vars.sample))).toMatchObject({ id: full?.description });
    expect(JSON.parse(renderTests(tests))).toHaveLength(56);
  });

  it('provider chạy một mẫu (mock): trả JSON đã chấm + token + chi phí', async () => {
    const provider = createProvider({ backend: 'mock' }, {});
    const result = await provider.call(samples[1]);
    const parsed = JSON.parse(result.output);
    expect(parsed).toMatchObject({ id: samples[1]?.id, ok: true });
    expect(parsed.checks).toHaveProperty('label');
    expect(result.tokenUsage).toEqual({ prompt: 0, completion: 0, total: 0 });
    expect(result.cost).toBe(0);
  });

  it('provider: mẫu bị lọc quy tắc → ok:false kèm mã lỗi, không ném', async () => {
    const provider = createProvider({ backend: 'mock', variantCount: 2 }, {});
    const skipped = { ...samples[0], id: 'emoji', text: '😍😍' };
    const parsed = JSON.parse((await provider.call(skipped)).output);
    expect(parsed).toMatchObject({ ok: false, error: 'skipped' });
  });
});

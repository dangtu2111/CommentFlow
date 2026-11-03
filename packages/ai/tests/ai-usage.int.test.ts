import { randomUUID } from 'node:crypto';
import { createDb, type FlowDb } from '@flow/db';
import { aiUsage } from '@flow/db/schema/cf';
import { workspaces } from '@flow/db/schema/core';
import { maskPii, unsafeMarkMasked } from '@flow/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLlmClient } from '../src/llm-client';

let db: FlowDb;

beforeAll(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Thiếu TEST_DATABASE_URL');
  db = createDb({ connectionString: url, max: 3 });
});
afterAll(async () => {
  await db.close();
});

async function newWorkspace(): Promise<string> {
  const id = randomUUID();
  await db.withWorkspace(id, (tx) =>
    tx.insert(workspaces).values({ id, name: 'Shop AI', slug: `shop-ai-${id}` }),
  );
  return id;
}

const rowsOf = (workspaceId: string) =>
  db.withWorkspace(workspaceId, (tx) => tx.select().from(aiUsage));

const fakeLiteLlm = (headers: Record<string, string> = {}): typeof fetch =>
  (async () =>
    new Response(
      JSON.stringify({
        model: 'mock-llm',
        choices: [{ message: { content: 'Trả lời thử' } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 40 },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json', ...headers } },
    )) as typeof fetch;

describe('callLlm ghi ai_usage vào DB thật (LiteLLM giả)', () => {
  it('mỗi lần gọi tạo đúng 1 dòng, đúng số liệu, chỉ workspace đó thấy', async () => {
    const wsA = await newWorkspace();
    const wsB = await newWorkspace();
    const client = createLlmClient({
      db,
      baseUrl: 'http://litellm.test',
      apiKey: 'sk-thu',
      fetchImpl: fakeLiteLlm({ 'x-litellm-response-cost': '0.00123' }),
    });

    const result = await client.call({
      workspaceId: wsA,
      step: 'classify',
      model: 'mock-llm',
      promptVersion: 'classify@1',
      messages: [
        { role: 'system', content: unsafeMarkMasked('Phân loại bình luận.') },
        { role: 'user', content: maskPii('gọi 0912345678 nhé') },
      ],
    });

    const rows = await rowsOf(wsA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.usageId,
      workspaceId: wsA,
      step: 'classify',
      model: 'mock-llm',
      promptVersion: 'classify@1',
      inputTokens: 100,
      outputTokens: 20,
      cachedTokens: 40,
      cacheHit: false,
    });
    expect(Number(rows[0]?.costUsd)).toBeCloseTo(0.00123, 6);
    expect(await rowsOf(wsB)).toHaveLength(0);
  });

  it('hai lần gọi → hai dòng; lần trả từ cache được đánh dấu cache_hit', async () => {
    const ws = await newWorkspace();
    const missClient = createLlmClient({
      db,
      baseUrl: 'http://x',
      apiKey: 'k',
      fetchImpl: fakeLiteLlm(),
    });
    const hitClient = createLlmClient({
      db,
      baseUrl: 'http://x',
      apiKey: 'k',
      fetchImpl: fakeLiteLlm({ 'x-litellm-cache-key': 'dev:litellm:abc' }),
    });
    const base = {
      workspaceId: ws,
      step: 'draft',
      model: 'mock-llm',
      promptVersion: 'draft@1',
      messages: [{ role: 'user' as const, content: unsafeMarkMasked('xin chào') }],
    };
    await missClient.call(base);
    await hitClient.call(base);
    const rows = await rowsOf(ws);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.cacheHit).sort()).toEqual([false, true]);
  });

  it('lỗi từ LiteLLM → không ghi dòng nào', async () => {
    const ws = await newWorkspace();
    const client = createLlmClient({
      db,
      baseUrl: 'http://x',
      apiKey: 'k',
      fetchImpl: (async () => new Response('lỗi', { status: 503 })) as typeof fetch,
    });
    await expect(
      client.call({
        workspaceId: ws,
        step: 'classify',
        model: 'mock-llm',
        promptVersion: 'v1',
        messages: [{ role: 'user', content: unsafeMarkMasked('x') }],
      }),
    ).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(await rowsOf(ws)).toHaveLength(0);
  });

  it('LiteLLM không chạy (cổng đóng) → LLM_UNAVAILABLE, không ghi dòng nào', async () => {
    const ws = await newWorkspace();
    const client = createLlmClient({
      db,
      baseUrl: 'http://127.0.0.1:1',
      apiKey: 'k',
      timeoutMs: 3000,
    });
    await expect(
      client.call({
        workspaceId: ws,
        step: 'classify',
        model: 'mock-llm',
        promptVersion: 'v1',
        messages: [{ role: 'user', content: unsafeMarkMasked('x') }],
      }),
    ).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(await rowsOf(ws)).toHaveLength(0);
  });
});

// Gọi LiteLLM THẬT (model giả mock-llm, không tốn tiền). Cần LITELLM_BASE_URL + LITELLM_API_KEY (khóa ảo).
const live = process.env.LITELLM_BASE_URL && process.env.LITELLM_API_KEY ? describe : describe.skip;
live('callLlm với LiteLLM thật (mock-llm)', () => {
  it('trả lời giả, ghi 1 dòng ai_usage; lần gọi lặp lại trúng cache', async () => {
    const ws = await newWorkspace();
    const client = createLlmClient({
      db,
      baseUrl: process.env.LITELLM_BASE_URL as string,
      apiKey: process.env.LITELLM_API_KEY as string,
    });
    const base = {
      workspaceId: ws,
      step: 'smoke',
      model: 'mock-llm',
      promptVersion: 'smoke@1',
      // Nội dung ngẫu nhiên để lần đầu chắc chắn không trúng cache cũ.
      messages: [{ role: 'user' as const, content: unsafeMarkMasked(`kiem tra ${randomUUID()}`) }],
    };
    const first = await client.call(base);
    expect(first.text).toBe('Đây là phản hồi giả để kiểm thử.');
    expect(first.cacheHit).toBe(false);
    const second = await client.call(base);
    expect(second.cacheHit).toBe(true);
    expect(await rowsOf(ws)).toHaveLength(2);
  });
});

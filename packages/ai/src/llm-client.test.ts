import type { FlowDb } from '@flow/db';
import { aiUsage } from '@flow/db/schema/cf';
import { isAppError, maskPii, unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { createLlmClient, type LlmCallInput } from './llm-client';

const WS = '11111111-1111-4111-8111-111111111111';
const API_KEY = 'sk-test-khong-phai-khoa-that';
const SECRET_PROMPT = 'noi dung rieng tu cua khach: ban-xuyen-tam-1234';

const input = (over: Partial<LlmCallInput> = {}): LlmCallInput => ({
  workspaceId: WS,
  step: 'classify',
  model: 'mock-llm',
  promptVersion: 'classify@1',
  messages: [
    { role: 'system', content: unsafeMarkMasked('Bạn là trợ lý của shop.') },
    { role: 'user', content: maskPii(SECRET_PROMPT) },
  ],
  ...over,
});

function fakeDb(options: { failInsert?: boolean } = {}) {
  const inserted: { table: unknown; values: Record<string, unknown>; workspaceId: string }[] = [];
  const db = {
    withWorkspace: async (workspaceId: string, fn: (tx: unknown) => unknown) =>
      fn({
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown>) => ({
            returning: async () => {
              if (options.failInsert) throw new Error(`lỗi ghi DB: ${SECRET_PROMPT}`);
              inserted.push({ table, values, workspaceId });
              return [{ id: 'usage-1' }];
            },
          }),
        }),
      }),
  } as unknown as FlowDb;
  return { db, inserted };
}

type Captured = { url: string; init: RequestInit };
function fakeFetch(respond: () => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const okBody = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: 'mock-llm',
    choices: [{ message: { role: 'assistant', content: 'Xin chào!' } }],
    usage: { prompt_tokens: 12, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 4 } },
    ...extra,
  });

const jsonResponse = (body: string, headers: Record<string, string> = {}, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } });

const client = (db: FlowDb, fetchImpl: typeof fetch, extra: object = {}) =>
  createLlmClient({
    db,
    baseUrl: 'http://litellm.test:4000/',
    apiKey: API_KEY,
    fetchImpl,
    ...extra,
  });

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : `KHÁC: ${String(error)}`;
  }
  return undefined;
};

describe('createLlmClient.call — yêu cầu gửi đi', () => {
  it('POST /v1/chat/completions với khóa Bearer, model, tin nhắn và metadata theo dõi (khóa cf_workspace_id: LiteLLM từ chối workspace_id)', async () => {
    const { db } = fakeDb();
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(okBody()));
    await client(db, fetchImpl).call(input({ maxTokens: 300, temperature: 0.2 }));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://litellm.test:4000/v1/chat/completions');
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`);
    expect(headers.get('content-type')).toBe('application/json');
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).toMatchObject({
      model: 'mock-llm',
      max_tokens: 300,
      temperature: 0.2,
      user: WS,
      metadata: { cf_workspace_id: WS, step: 'classify', prompt_version: 'classify@1' },
    });
    expect(body.messages).toHaveLength(2);
  });

  it('seed (nếu có) được gửi đi để giảm dao động giữa các lượt; không có thì không gửi trường seed', async () => {
    const { db } = fakeDb();
    const withSeed = fakeFetch(() => jsonResponse(okBody()));
    await client(db, withSeed.fetchImpl).call(input({ seed: 7 }));
    expect(JSON.parse(String(withSeed.calls[0]?.init.body)).seed).toBe(7);
    const without = fakeFetch(() => jsonResponse(okBody()));
    await client(db, without.fetchImpl).call(input());
    expect('seed' in JSON.parse(String(without.calls[0]?.init.body))).toBe(false);
  });

  it('FR-138 tin nhắn có cache → khối cache_control ephemeral; không có thì giữ chuỗi thường', async () => {
    const { db } = fakeDb();
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(okBody()));
    await client(db, fetchImpl).call(
      input({
        messages: [
          { role: 'system', content: unsafeMarkMasked('Cố định'), cache: true },
          { role: 'user', content: unsafeMarkMasked('Hay đổi') },
        ],
      }),
    );
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: [{ type: 'text', text: 'Cố định', cache_control: { type: 'ephemeral' } }],
    });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hay đổi' });
  });

  it('nội dung gửi đi là bản đã che PII (email/SĐT không lọt ra ngoài)', async () => {
    const { db } = fakeDb();
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(okBody()));
    await client(db, fetchImpl).call(
      input({ messages: [{ role: 'user', content: maskPii('gọi 0912345678 hoặc a@b.co') }] }),
    );
    const sent = String(calls[0]?.init.body);
    expect(sent).not.toContain('0912345678');
    expect(sent).not.toContain('a@b.co');
    expect(sent).toContain('[sđt]');
  });

  it('kiểu dữ liệu buộc dùng MaskedText: chuỗi thô không biên dịch được', () => {
    const bad: LlmCallInput = input({
      // @ts-expect-error — content phải là MaskedText (qua maskPii/unsafeMarkMasked), không phải string thô
      messages: [{ role: 'user', content: 'chuỗi thô' }],
    });
    expect(bad).toBeDefined();
  });
});

describe('FR-034 createLlmClient.call — kết quả và ghi ai_usage', () => {
  it('trả kết quả và ghi ĐÚNG MỘT dòng ai_usage trong ngữ cảnh workspace', async () => {
    const { db, inserted } = fakeDb();
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse(okBody(), { 'x-litellm-response-cost': '0.000123' }),
    );
    const result = await client(db, fetchImpl).call(
      input({ draftId: '22222222-2222-4222-8222-222222222222' }),
    );

    expect(result).toEqual({
      text: 'Xin chào!',
      model: 'mock-llm',
      inputTokens: 12,
      outputTokens: 7,
      cachedTokens: 4,
      reasoningTokens: 0,
      costUsd: 0.000123,
      cacheHit: false,
      usageId: 'usage-1',
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.table).toBe(aiUsage);
    expect(inserted[0]?.workspaceId).toBe(WS);
    expect(inserted[0]?.values).toMatchObject({
      workspaceId: WS,
      draftId: '22222222-2222-4222-8222-222222222222',
      step: 'classify',
      model: 'mock-llm',
      promptVersion: 'classify@1',
      inputTokens: 12,
      outputTokens: 7,
      cachedTokens: 4,
      costUsd: '0.000123',
      cacheHit: false,
    });
  });

  it('cache hit: nhận biết qua header x-litellm-cache-key', async () => {
    const { db, inserted } = fakeDb();
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse(okBody(), { 'x-litellm-cache-key': 'dev:litellm:abc' }),
    );
    const result = await client(db, fetchImpl).call(input());
    expect(result.cacheHit).toBe(true);
    expect(inserted[0]?.values.cacheHit).toBe(true);
  });

  it('chi phí: lấy header -input/-output khi không có tổng; thiếu hẳn → 0', async () => {
    const { db } = fakeDb();
    const a = fakeFetch(() =>
      jsonResponse(okBody(), {
        'x-litellm-response-cost-input': '0.0001',
        'x-litellm-response-cost-output': '0.0002',
      }),
    );
    expect((await client(db, a.fetchImpl).call(input())).costUsd).toBeCloseTo(0.0003, 8);
    const b = fakeFetch(() => jsonResponse(okBody()));
    expect((await client(db, b.fetchImpl).call(input())).costUsd).toBe(0);
    const c = fakeFetch(() =>
      jsonResponse(okBody(), { 'x-litellm-response-cost': 'not-a-number' }),
    );
    expect((await client(db, c.fetchImpl).call(input())).costUsd).toBe(0);
  });

  it('thiếu usage → token = 0; nội dung null → chuỗi rỗng (vẫn ghi ai_usage)', async () => {
    const { db, inserted } = fakeDb();
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse(JSON.stringify({ choices: [{ message: { content: null } }] })),
    );
    const result = await client(db, fetchImpl).call(input());
    expect(result.text).toBe('');
    expect(result.inputTokens).toBe(0);
    expect(inserted).toHaveLength(1);
  });

  it('ghi ai_usage lỗi → INTERNAL, thông báo không chứa nội dung prompt', async () => {
    const { db } = fakeDb({ failInsert: true });
    const { fetchImpl } = fakeFetch(() => jsonResponse(okBody()));
    try {
      await client(db, fetchImpl).call(input());
      expect.unreachable();
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('INTERNAL');
      expect((error as Error).message).not.toContain(SECRET_PROMPT);
    }
  });
});

describe('createLlmClient.call — lỗi', () => {
  it('401/403 → CONFIG_INVALID (khóa sai/thiếu quyền)', async () => {
    for (const status of [401, 403]) {
      const { db, inserted } = fakeDb();
      const { fetchImpl } = fakeFetch(() =>
        jsonResponse(`{"error":"${SECRET_PROMPT}"}`, {}, status),
      );
      expect(await codeOf(client(db, fetchImpl).call(input()))).toBe('CONFIG_INVALID');
      expect(inserted).toHaveLength(0);
    }
  });

  it('429, 500, 503 → LLM_UNAVAILABLE và không ghi ai_usage', async () => {
    for (const status of [429, 500, 503]) {
      const { db, inserted } = fakeDb();
      const { fetchImpl } = fakeFetch(() => jsonResponse('lỗi', {}, status));
      expect(await codeOf(client(db, fetchImpl).call(input()))).toBe('LLM_UNAVAILABLE');
      expect(inserted).toHaveLength(0);
    }
  });

  it('lỗi mạng và hết thời gian → LLM_UNAVAILABLE', async () => {
    const { db } = fakeDb();
    const network = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    expect(await codeOf(client(db, network.fetchImpl).call(input()))).toBe('LLM_UNAVAILABLE');

    const timeout = fakeFetch(() => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    expect(await codeOf(client(db, timeout.fetchImpl).call(input()))).toBe('LLM_UNAVAILABLE');
  });

  it('truyền tín hiệu hết giờ (timeoutMs) cho fetch', async () => {
    const { db } = fakeDb();
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(okBody()));
    await client(db, fetchImpl, { timeoutMs: 1234 }).call(input());
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('phản hồi không phải JSON hoặc sai cấu trúc → LLM_UNAVAILABLE', async () => {
    const { db } = fakeDb();
    for (const body of ['không phải json', '{}', '{"choices":[]}']) {
      const { fetchImpl } = fakeFetch(() => jsonResponse(body));
      expect(await codeOf(client(db, fetchImpl).call(input()))).toBe('LLM_UNAVAILABLE');
    }
  });

  it('thông báo lỗi và log không chứa prompt, nội dung phản hồi hay khóa API', async () => {
    const logs: string[] = [];
    const logger = {
      warn: (obj: Record<string, unknown>, msg: string) => logs.push(JSON.stringify([obj, msg])),
    };
    const { db } = fakeDb();
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse(`echo ${SECRET_PROMPT} ${API_KEY}`, {}, 500),
    );
    try {
      await client(db, fetchImpl, { logger }).call(input());
      expect.unreachable();
    } catch (error) {
      const text = `${(error as Error).message} ${JSON.stringify(error)}`;
      expect(text).not.toContain(SECRET_PROMPT);
      expect(text).not.toContain(API_KEY);
    }
    const allLogs = logs.join('');
    expect(allLogs).not.toContain(SECRET_PROMPT);
    expect(allLogs).not.toContain(API_KEY);
    expect(allLogs).toContain('classify'); // vẫn đủ thông tin để chẩn đoán (bước, mã HTTP)
  });
});

describe('createLlmClient.call — kiểm tra đầu vào (trước khi gọi mạng)', () => {
  it('workspaceId/step/model/messages sai → VALIDATION_FAILED và không gọi fetch', async () => {
    const { db } = fakeDb();
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(okBody()));
    const c = client(db, fetchImpl);
    const bads: Partial<LlmCallInput>[] = [
      { workspaceId: 'không-phải-uuid' },
      { step: '' },
      { step: 'có khoảng trắng và ký tự lạ!' },
      { model: '' },
      { promptVersion: '' },
      { messages: [] },
      { messages: [{ role: 'user', content: unsafeMarkMasked('') }] },
      { maxTokens: 0 },
      { temperature: 3 },
    ];
    for (const bad of bads) {
      expect(await codeOf(c.call(input(bad))), JSON.stringify(bad)).toBe('VALIDATION_FAILED');
    }
    expect(calls).toHaveLength(0);
  });
});

describe('createLlmClient.call — logprobs (docs/09 §6.0)', () => {
  it('chỉ gửi logprobs khi được xin; trả logprob từng token khi nhà cung cấp có', async () => {
    const { db } = fakeDb();
    const withLogprobs = okBody({
      choices: [
        {
          message: { role: 'assistant', content: 'x' },
          logprobs: { content: [{ token: 'x', logprob: -0.1 }] },
        },
      ],
    });
    const asked = fakeFetch(() => jsonResponse(withLogprobs));
    const result = await client(db, asked.fetchImpl).call(input({ logprobs: true }));
    expect(JSON.parse(String(asked.calls[0]?.init.body)).logprobs).toBe(true);
    expect(result.logprobs).toEqual([{ token: 'x', logprob: -0.1 }]);

    const notAsked = fakeFetch(() => jsonResponse(okBody()));
    const plain = await client(db, notAsked.fetchImpl).call(input());
    expect('logprobs' in JSON.parse(String(notAsked.calls[0]?.init.body))).toBe(false);
    expect(plain.logprobs).toBeUndefined();
  });
});

describe('createLlmClient.call — structured output (response_format json_schema)', () => {
  it('gửi response_format strict khi có responseFormat; không gửi khi không có', async () => {
    const { db } = fakeDb();
    const schema = { type: 'object', additionalProperties: false, properties: {}, required: [] };
    const a = fakeFetch(() => jsonResponse(okBody()));
    await client(db, a.fetchImpl).call(input({ responseFormat: { name: 'cf_test', schema } }));
    expect(JSON.parse(String(a.calls[0]?.init.body)).response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'cf_test', strict: true, schema },
    });
    const b = fakeFetch(() => jsonResponse(okBody()));
    await client(db, b.fetchImpl).call(input());
    expect('response_format' in JSON.parse(String(b.calls[0]?.init.body))).toBe(false);
  });

  it('tên schema không hợp lệ → VALIDATION_FAILED, không gọi mạng', async () => {
    const { db } = fakeDb();
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(okBody()));
    const code = await codeOf(
      client(db, fetchImpl).call(input({ responseFormat: { name: 'tên sai!', schema: {} } })),
    );
    expect(code).toBe('VALIDATION_FAILED');
    expect(calls).toHaveLength(0);
  });
});

describe('createLlmClient.call — token suy luận (Q-LLM2, ai_usage.reasoning_tokens)', () => {
  it('đọc completion_tokens_details.reasoning_tokens, trả về và ghi vào ai_usage', async () => {
    const { db, inserted } = fakeDb();
    const body = okBody({
      usage: {
        prompt_tokens: 10,
        completion_tokens: 50,
        completion_tokens_details: { reasoning_tokens: 32 },
      },
    });
    const { fetchImpl } = fakeFetch(() => jsonResponse(body));
    const result = await client(db, fetchImpl).call(input());
    expect(result.reasoningTokens).toBe(32);
    expect(result.outputTokens).toBe(50);
    expect(inserted[0]?.values).toMatchObject({ reasoningTokens: 32, outputTokens: 50 });
  });

  it('nhà cung cấp không trả chi tiết → 0 (không ném lỗi)', async () => {
    const { db, inserted } = fakeDb();
    const { fetchImpl } = fakeFetch(() => jsonResponse(okBody()));
    const result = await client(db, fetchImpl).call(input());
    expect(result.reasoningTokens).toBe(0);
    expect(inserted[0]?.values).toMatchObject({ reasoningTokens: 0 });
  });
});

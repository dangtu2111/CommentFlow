import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAiDirectFetch,
  DIRECT_ALIASES,
  lowestReasoningEffort,
  OPENAI_BASE_URL,
  SpendLimitError,
} from './openai-direct';

const URL_OK = `${OPENAI_BASE_URL}/v1/chat/completions`;
const clientBody = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: 'cf-classify',
    messages: [{ role: 'user', content: 'x' }],
    max_tokens: 600,
    temperature: 0,
    logprobs: true,
    user: 'ws',
    metadata: { step: 'extract' },
    response_format: { type: 'json_schema' },
    ...over,
  });
const okResponse = (
  usage: Record<string, unknown> = { prompt_tokens: 1000, completion_tokens: 100 },
  model = 'gpt-5-nano-2025-08-07',
) =>
  new Response(JSON.stringify({ model, choices: [{ message: { content: '{}' } }], usage }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-length': '999' },
  });

function setup(respond: () => Response = () => okResponse(), limits = { maxCalls: 5, maxUsd: 1 }) {
  const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
  const baseFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body)) });
    return respond();
  }) as unknown as typeof fetch;
  const direct = createOpenAiDirectFetch({
    apiKey: 'sk-test-khong-phai-khoa-that',
    ...limits,
    baseFetch,
  });
  return { direct, calls };
}

describe('EVAL-RUNNER bộ chuyển đổi gọi trực tiếp OpenAI', () => {
  it('dịch tham số cho họ gpt-5: max_completion_tokens, bỏ temperature/logprobs/user/metadata, giữ response_format', async () => {
    const { direct, calls } = setup();
    await direct(URL_OK, { method: 'POST', body: clientBody() });
    expect(calls[0]?.body).toEqual({
      model: 'gpt-5-nano',
      messages: [{ role: 'user', content: 'x' }],
      max_completion_tokens: 600,
      reasoning_effort: 'minimal',
      response_format: { type: 'json_schema' },
    });
  });

  it('bí danh → model thật; reasoning_effort thấp nhất theo model (luna: none, nano: minimal, lạ: không gửi)', async () => {
    expect(DIRECT_ALIASES).toEqual({ 'cf-classify': 'gpt-5-nano', 'cf-draft': 'gpt-5.6-luna' });
    expect(lowestReasoningEffort('gpt-5.6-luna')).toBe('none');
    expect(lowestReasoningEffort('gpt-5-nano-2025-08-07')).toBe('minimal');
    expect(lowestReasoningEffort('gpt-lạ')).toBeUndefined();
    const { direct, calls } = setup();
    await direct(URL_OK, { method: 'POST', body: clientBody({ model: 'cf-draft' }) });
    await direct(URL_OK, {
      method: 'POST',
      body: clientBody({ model: 'gpt-lạ', max_tokens: undefined, response_format: undefined }),
    });
    expect(calls[0]?.body).toMatchObject({ model: 'gpt-5.6-luna', reasoning_effort: 'none' });
    expect(calls[1]?.body).toEqual({ model: 'gpt-lạ', messages: [{ role: 'user', content: 'x' }] });
  });

  it('khóa chỉ nằm ở header Authorization; chỉ gọi tới api.openai.com', async () => {
    const { direct, calls } = setup();
    await direct(URL_OK, { method: 'POST', body: clientBody() });
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('authorization')).toBe('Bearer sk-test-khong-phai-khoa-that');
    expect(JSON.stringify(calls[0]?.body)).not.toContain('sk-test');
    await expect(
      direct('https://litellm.local/v1/chat/completions', { method: 'POST', body: clientBody() }),
    ).rejects.toThrow('không phải OpenAI');
    expect(calls).toHaveLength(1);
  });

  it('tính chi phí từ bảng giá và gắn vào header x-litellm-response-cost; bỏ content-length cũ', async () => {
    const { direct } = setup(() =>
      okResponse({ prompt_tokens: 1_000_000, completion_tokens: 0 }, 'gpt-5-nano'),
    );
    const response = await direct(URL_OK, { method: 'POST', body: clientBody() });
    expect(Number(response.headers.get('x-litellm-response-cost'))).toBeCloseTo(0.05, 10);
    expect(response.headers.has('content-length')).toBe(false);
    expect(direct.stats()).toMatchObject({ calls: 1 });
    expect(direct.stats().usd).toBeCloseTo(0.05, 10);
  });

  it('model không có trong bảng giá → không gắn header chi phí (không đoán)', async () => {
    const { direct } = setup(() =>
      okResponse({ prompt_tokens: 10, completion_tokens: 10 }, 'gpt-lạ'),
    );
    const response = await direct(URL_OK, {
      method: 'POST',
      body: clientBody({ model: 'gpt-lạ' }),
    });
    expect(response.headers.has('x-litellm-response-cost')).toBe(false);
  });

  it('lỗi HTTP của OpenAI được trả nguyên cho client xử lý', async () => {
    const { direct } = setup(() => new Response('{"error":{"code":"x"}}', { status: 400 }));
    const response = await direct(URL_OK, { method: 'POST', body: clientBody() });
    expect(response.status).toBe(400);
  });

  it('đạt trần số lần gọi hoặc trần chi phí → ném SpendLimitError, KHÔNG gọi thêm', async () => {
    const byCalls = setup(() => okResponse(), { maxCalls: 1, maxUsd: 10 });
    await byCalls.direct(URL_OK, { method: 'POST', body: clientBody() });
    await expect(
      byCalls.direct(URL_OK, { method: 'POST', body: clientBody() }),
    ).rejects.toBeInstanceOf(SpendLimitError);
    expect(byCalls.calls).toHaveLength(1);

    const byUsd = setup(
      () => okResponse({ prompt_tokens: 1_000_000, completion_tokens: 0 }, 'gpt-5-nano'),
      { maxCalls: 10, maxUsd: 0.01 },
    );
    await byUsd.direct(URL_OK, { method: 'POST', body: clientBody() });
    await expect(
      byUsd.direct(URL_OK, { method: 'POST', body: clientBody() }),
    ).rejects.toMatchObject({ reason: 'usd' });
    expect(byUsd.calls).toHaveLength(1);
  });
});

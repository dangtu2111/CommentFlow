import { costFromUsage } from './pricing';

/**
 * Bộ chuyển đổi `fetch` để chạy EVAL-RUNNER bằng khóa OpenAI TRỰC TIẾP khi chưa có LiteLLM (thay vai trò dịch tham số của
 * LiteLLM, vốn `drop_params: true`). KHÔNG dùng trong sản phẩm: bỏ qua trần chi phí `max_budget` của khóa ảo nên có trần
 * riêng (`maxCalls`, `maxUsd`) và chỉ gọi tới `api.openai.com`. Lỗi không chứa khóa hay nội dung.
 *
 * Dịch tham số cho họ gpt-5 (model suy luận): `max_tokens` → `max_completion_tokens`; bỏ `temperature`, `logprobs`, `metadata`,
 * `user` (không hỗ trợ hoặc không cần); thêm `reasoning_effort` thấp nhất mà model hỗ trợ (Q-LLM2); chi phí tính từ bảng giá
 * rồi gắn vào header `x-litellm-response-cost` để `LlmClient` đọc như khi đi qua LiteLLM.
 */
export const OPENAI_BASE_URL = 'https://api.openai.com';

/** Bí danh LiteLLM → model OpenAI thật (khi không có LiteLLM). */
export const DIRECT_ALIASES: Readonly<Record<string, string>> = {
  'cf-classify': 'gpt-5-nano',
  'cf-draft': 'gpt-5.6-luna',
};

/** `reasoning_effort` thấp nhất mà model hỗ trợ (đã kiểm trên trang OpenAI): luna có `none`; nano dùng `minimal`. */
export function lowestReasoningEffort(model: string): string | undefined {
  if (model.startsWith('gpt-5.6-luna')) return 'none';
  if (model.startsWith('gpt-5-nano')) return 'minimal';
  return undefined;
}

export type DirectFetchOptions = {
  apiKey: string;
  /** Trần số lần gọi; vượt → ném lỗi (không gọi thêm). */
  maxCalls: number;
  /** Trần tổng chi phí ước tính (USD); đạt trần → ném lỗi cho lần gọi kế. */
  maxUsd: number;
  baseFetch?: typeof fetch;
};

export class SpendLimitError extends Error {
  constructor(readonly reason: 'calls' | 'usd') {
    super(reason === 'calls' ? 'Đã đạt trần số lần gọi.' : 'Đã đạt trần chi phí.');
    this.name = 'SpendLimitError';
  }
}

export type DirectFetch = typeof fetch & { stats: () => { calls: number; usd: number } };

export function createOpenAiDirectFetch(options: DirectFetchOptions): DirectFetch {
  const baseFetch = options.baseFetch ?? fetch;
  let calls = 0;
  let usd = 0;

  const direct = (async (url: string | URL | Request, init?: RequestInit) => {
    if (!String(url).startsWith(`${OPENAI_BASE_URL}/`))
      throw new Error('Chặn: địa chỉ không phải OpenAI.');
    if (calls >= options.maxCalls) throw new SpendLimitError('calls');
    if (usd >= options.maxUsd) throw new SpendLimitError('usd');
    calls += 1;

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const model = DIRECT_ALIASES[String(body.model)] ?? String(body.model);
    const effort = lowestReasoningEffort(model);
    const payload: Record<string, unknown> = {
      model,
      messages: body.messages,
      ...(typeof body.max_tokens === 'number' ? { max_completion_tokens: body.max_tokens } : {}),
      ...(effort ? { reasoning_effort: effort } : {}),
      ...(body.response_format ? { response_format: body.response_format } : {}),
    };
    const response = await baseFetch(String(url), {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string>),
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return response;

    const text = await response.text();
    const parsed = JSON.parse(text) as {
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    const cost = costFromUsage(parsed.model ?? model, {
      inputTokens: parsed.usage?.prompt_tokens ?? 0,
      outputTokens: parsed.usage?.completion_tokens ?? 0,
      cachedTokens: parsed.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    });
    usd += cost ?? 0;
    const headers = new Headers(response.headers);
    if (cost !== null) headers.set('x-litellm-response-cost', String(cost));
    headers.delete('content-length');
    return new Response(text, { status: response.status, headers });
  }) as DirectFetch;
  direct.stats = () => ({ calls, usd });
  return direct;
}

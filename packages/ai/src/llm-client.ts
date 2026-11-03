import type { FlowDb } from '@flow/db';
import { aiUsage } from '@flow/db/schema/cf';
import { AppError, type MaskedText } from '@flow/shared';
import { z } from 'zod';

/**
 * Lớp bọc DUY NHẤT để gọi LLM (qua LiteLLM). Mọi lần gọi ghi một dòng `ai_usage` (nguyên tắc #7);
 * nội dung gửi đi bắt buộc là `MaskedText` (nguyên tắc #6). Lỗi không bao giờ chứa prompt/nội dung
 * phản hồi/khóa API.
 */

export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: MaskedText };

export type LlmCallInput = {
  workspaceId: string;
  /** Bước của pipeline, ví dụ `classify`, `draft` (ghi vào ai_usage.step). */
  step: string;
  /** Tên model theo cấu hình LiteLLM (ví dụ `mock-llm`). */
  model: string;
  promptVersion: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  draftId?: string;
};

export type LlmCallResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  cacheHit: boolean;
  usageId: string;
};

export type LlmClientOptions = {
  db: FlowDb;
  /** Ví dụ http://192.168.1.124:4000 (LITELLM_BASE_URL). */
  baseUrl: string;
  /** Khóa ảo (virtual key) của LiteLLM; KHÔNG dùng master key. */
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Chỉ nhận siêu dữ liệu an toàn (bước, mã HTTP) — không bao giờ nội dung prompt. */
  logger?: { warn(fields: Record<string, unknown>, message: string): void };
};

const DEFAULT_TIMEOUT_MS = 30_000;

const inputSchema = z.object({
  workspaceId: z.uuid(),
  step: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
  model: z.string().min(1).max(128),
  promptVersion: z.string().min(1).max(64),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .min(1),
  maxTokens: z.number().int().positive().max(32_768).optional(),
  temperature: z.number().min(0).max(2).optional(),
  draftId: z.uuid().optional(),
});

const responseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().default(0),
      completion_tokens: z.number().int().nonnegative().default(0),
      prompt_tokens_details: z
        .object({ cached_tokens: z.number().int().nonnegative().optional() })
        .nullish(),
    })
    .optional(),
});

function numberHeader(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Chi phí: header tổng nếu có, nếu không cộng phần input + output (+ công cụ); thiếu → 0. */
function costFromHeaders(headers: Headers): number {
  const total = numberHeader(headers, 'x-litellm-response-cost');
  if (total !== undefined) return total;
  const parts = ['input', 'output', 'tool-usage'].map(
    (suffix) => numberHeader(headers, `x-litellm-response-cost-${suffix}`) ?? 0,
  );
  return parts.reduce((sum, part) => sum + part, 0);
}

export function createLlmClient(options: LlmClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async call(rawInput: LlmCallInput): Promise<LlmCallResult> {
      const parsed = inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', 'Tham số gọi LLM không hợp lệ.');
      }
      const input = parsed.data;

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: input.model,
            messages: input.messages,
            ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
            ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
            user: input.workspaceId,
            metadata: {
              workspace_id: input.workspaceId,
              step: input.step,
              prompt_version: input.promptVersion,
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        options.logger?.warn(
          { step: input.step, model: input.model },
          'Gọi LiteLLM thất bại (mạng/hết giờ)',
        );
        throw new AppError('LLM_UNAVAILABLE', 'Không kết nối được dịch vụ AI.', {
          cause: cause instanceof Error ? new Error(cause.name) : undefined,
        });
      }

      if (!response.ok) {
        options.logger?.warn(
          { step: input.step, model: input.model, status: response.status },
          'LiteLLM trả về lỗi HTTP',
        );
        if (response.status === 401 || response.status === 403) {
          throw new AppError('CONFIG_INVALID', 'Khóa LiteLLM không hợp lệ hoặc thiếu quyền.');
        }
        throw new AppError('LLM_UNAVAILABLE', `Dịch vụ AI trả về lỗi HTTP ${response.status}.`);
      }

      let body: z.infer<typeof responseSchema>;
      try {
        body = responseSchema.parse(await response.json());
      } catch {
        options.logger?.warn(
          { step: input.step, model: input.model },
          'Phản hồi LiteLLM sai định dạng',
        );
        throw new AppError('LLM_UNAVAILABLE', 'Phản hồi của dịch vụ AI không đúng định dạng.');
      }

      const result: Omit<LlmCallResult, 'usageId'> = {
        text: body.choices[0]?.message.content ?? '',
        model: body.model ?? input.model,
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
        cachedTokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        costUsd: costFromHeaders(response.headers),
        // LiteLLM chỉ gắn x-litellm-cache-key khi trả từ cache.
        cacheHit: response.headers.has('x-litellm-cache-key'),
      };

      try {
        const [row] = await options.db.withWorkspace(input.workspaceId, (tx) =>
          tx
            .insert(aiUsage)
            .values({
              workspaceId: input.workspaceId,
              draftId: input.draftId,
              step: input.step,
              model: result.model,
              promptVersion: input.promptVersion,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              cachedTokens: result.cachedTokens,
              costUsd: result.costUsd.toFixed(6),
              cacheHit: result.cacheHit,
            })
            .returning({ id: aiUsage.id }),
        );
        if (!row) throw new Error('không có dòng trả về');
        return { ...result, usageId: row.id };
      } catch (cause) {
        // Đã tốn chi phí gọi LLM mà không ghi được ai_usage → báo lỗi rõ ràng, không nuốt.
        options.logger?.warn({ step: input.step, model: input.model }, 'Không ghi được ai_usage');
        throw new AppError('INTERNAL', 'Đã gọi LLM nhưng không ghi được ai_usage.', {
          cause: cause instanceof Error ? new Error(cause.name) : undefined,
        });
      }
    },
  };
}

export type LlmClient = ReturnType<typeof createLlmClient>;

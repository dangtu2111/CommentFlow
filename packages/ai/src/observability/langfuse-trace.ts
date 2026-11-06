import { randomUUID } from 'node:crypto';
import { AppError, type ErrorCode } from '@flow/shared';
import { maskForTrace } from '../pii/mask-pipe';
import type { LangfuseConfig } from './config';

/**
 * Gửi trace lần gọi LLM sang Langfuse (LITELLM-LANGFUSE, FR-033/034; nguyên tắc 6).
 * Dùng API ingestion chính thức `POST {host}/api/public/ingestion` (Basic auth public:secret).
 * MỌI nội dung (input/output/metadata/lỗi) đi qua `maskForTrace` TRƯỚC khi vào body. Lỗi gửi trace không bao giờ
 * làm hỏng luồng gọi LLM (`recordTraceSafely`) và không chứa khóa/nội dung. Cờ tắt → sink no-op.
 */
export type LlmTraceEvent = {
  workspaceId: string;
  step: string;
  model: string;
  promptVersion: string;
  input: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
  startedAt: Date;
  latencyMs: number;
  error?: string;
  traceId?: string;
};

export interface TraceSink {
  record(event: LlmTraceEvent): Promise<void>;
}

export type LangfuseSinkDeps = {
  fetch?: typeof fetch;
  newId?: () => string;
};

const TIMEOUT_MS = 5000;

export function createNoopTraceSink(): TraceSink {
  return { record: async () => undefined };
}

/** Không giữ `cause`: lỗi gốc của fetch có thể kèm URL/khóa và bị bộ ghi log in ra. */
function unavailable(reason: string): AppError {
  return new AppError('LLM_UNAVAILABLE', `Không gửi được trace sang Langfuse (${reason}).`);
}

/** Các trường gửi nguyên văn (không che) phải là định danh an toàn, không thể mang SĐT/email. */
const IDENTIFIER = /^[A-Za-z0-9_.-]{1,64}$/;
const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertSafeIdentifiers(event: LlmTraceEvent, traceId: string): void {
  const ok =
    WORKSPACE_ID.test(event.workspaceId) &&
    IDENTIFIER.test(event.step) &&
    IDENTIFIER.test(event.model) &&
    IDENTIFIER.test(traceId);
  if (!ok) {
    throw new AppError('VALIDATION_FAILED', 'Trường định danh của trace không hợp lệ.');
  }
}

function buildBatch(event: LlmTraceEvent, traceId: string) {
  assertSafeIdentifiers(event, traceId);
  const timestamp = event.startedAt.toISOString();
  const endTime = new Date(event.startedAt.getTime() + event.latencyMs).toISOString();
  const input = maskForTrace(event.input);
  const output = maskForTrace(event.output);
  const metadata = maskForTrace({ ...event.metadata, promptVersion: event.promptVersion });
  const failed = event.error !== undefined;
  return [
    {
      id: randomUUID(),
      type: 'trace-create',
      timestamp,
      body: { id: traceId, name: event.step, userId: event.workspaceId, input, output, metadata },
    },
    {
      id: randomUUID(),
      type: 'generation-create',
      timestamp,
      body: {
        traceId,
        name: event.step,
        model: event.model,
        startTime: timestamp,
        endTime,
        input,
        output,
        metadata,
        level: failed ? 'ERROR' : 'DEFAULT',
        statusMessage: failed ? maskForTrace(event.error) : undefined,
        usageDetails: event.usage && {
          input: event.usage.inputTokens,
          output: event.usage.outputTokens,
        },
        costDetails: event.usage && { total: event.usage.costUsd },
      },
    },
  ];
}

export function createLangfuseTraceSink(
  config: { host: string; publicKey: string; secretKey: string },
  deps: LangfuseSinkDeps = {},
): TraceSink {
  const doFetch = deps.fetch ?? fetch;
  const newId = deps.newId ?? randomUUID;
  const authorization = `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`;
  return {
    async record(event) {
      const body = JSON.stringify({ batch: buildBatch(event, event.traceId ?? newId()) });
      let response: Response;
      try {
        response = await doFetch(`${config.host}/api/public/ingestion`, {
          method: 'POST',
          headers: { Authorization: authorization, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw unavailable('lỗi mạng');
      }
      if (!response.ok) throw unavailable(`HTTP ${response.status}`);
      const result = (await response.json().catch(() => ({}))) as { errors?: unknown[] };
      if (result.errors && result.errors.length > 0) throw unavailable('Langfuse từ chối sự kiện');
    },
  };
}

export function createTraceSink(config: LangfuseConfig, deps: LangfuseSinkDeps = {}): TraceSink {
  return config.enabled ? createLangfuseTraceSink(config, deps) : createNoopTraceSink();
}

/** Ghi trace, nuốt lỗi; chỉ báo MÃ lỗi cho `onError` (không nội dung, không khóa). */
export async function recordTraceSafely(
  sink: TraceSink,
  event: LlmTraceEvent,
  onError?: (code: ErrorCode) => void,
): Promise<void> {
  try {
    await sink.record(event);
  } catch (error) {
    onError?.(error instanceof AppError ? error.code : 'INTERNAL');
  }
}

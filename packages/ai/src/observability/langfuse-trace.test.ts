import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  createLangfuseTraceSink,
  createNoopTraceSink,
  createTraceSink,
  type LlmTraceEvent,
  recordTraceSafely,
} from './langfuse-trace';

const WS = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-11-06T01:00:00.000Z');
const SECRET = ['sk', 'test'].join('-');

function event(over: Partial<LlmTraceEvent> = {}): LlmTraceEvent {
  return {
    workspaceId: WS,
    step: 'draft',
    model: 'cf-draft',
    promptVersion: 'draft@3',
    input: [{ role: 'user', content: 'ib 0912345678 nhé' }],
    output: { reply: 'gọi a@b.co' },
    usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.001 },
    startedAt: T0,
    latencyMs: 250,
    ...over,
  };
}

function okFetch(body: unknown = { successes: [], errors: [] }, status = 207) {
  return vi.fn(
    async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status }),
  );
}

function makeSink(fetchFn = okFetch()) {
  const sink = createLangfuseTraceSink(
    { host: 'http://lf.test', publicKey: 'pk-test', secretKey: SECRET },
    { fetch: fetchFn as unknown as typeof fetch, newId: () => 'id-1' },
  );
  return { sink, fetchFn };
}

function sentBody(fetchFn: ReturnType<typeof okFetch>): string {
  return String(fetchFn.mock.calls[0]?.[1]?.body);
}

describe('FR-033 sink Langfuse che PII', () => {
  it('gọi đúng endpoint + Basic auth, gửi trace-create và generation-create', async () => {
    const { sink, fetchFn } = makeSink();
    await sink.record(event());
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('http://lf.test/api/public/ingestion');
    const auth = ((init?.headers ?? {}) as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${Buffer.from(`pk-test:${SECRET}`).toString('base64')}`);
    const batch = JSON.parse(String(init?.body)).batch as Array<{
      type: string;
      body: Record<string, unknown>;
    }>;
    expect(batch.map((b) => b.type)).toEqual(['trace-create', 'generation-create']);
    expect(batch[0]?.body).toMatchObject({ id: 'id-1', name: 'draft', userId: WS });
    expect(batch[1]?.body).toMatchObject({
      traceId: 'id-1',
      model: 'cf-draft',
      usageDetails: { input: 10, output: 5 },
      costDetails: { total: 0.001 },
    });
  });

  it('che SĐT/email ở input, output và metadata; bản gốc không rời máy', async () => {
    const { sink, fetchFn } = makeSink();
    await sink.record(event({ metadata: { note: 'zalo 0987654321' } }));
    const body = sentBody(fetchFn);
    for (const raw of ['0912345678', 'a@b.co', '0987654321']) expect(body).not.toContain(raw);
    expect(body).toContain('[sđt]');
    expect(body).toContain('[email]');
  });

  it('lỗi của lần gọi LLM được che và đánh mức ERROR', async () => {
    const { sink, fetchFn } = makeSink();
    await sink.record(
      event({ error: 'khách 0912345678 bị lỗi', output: undefined, usage: undefined }),
    );
    const body = sentBody(fetchFn);
    expect(body).not.toContain('0912345678');
    expect(body).toContain('"level":"ERROR"');
  });

  it('dùng traceId do người gọi đưa vào', async () => {
    const { sink, fetchFn } = makeSink();
    await sink.record(event({ traceId: 'trace-xyz' }));
    expect(sentBody(fetchFn)).toContain('"id":"trace-xyz"');
  });

  it('property: chuỗi bất kỳ chứa SĐT/email không bao giờ lọt nguyên ra body', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 20 }),
        fc.integer({ min: 10_000_000, max: 99_999_999 }),
        async (noise, digits) => {
          const phone = `09${digits}`;
          const { sink, fetchFn } = makeSink();
          await sink.record(event({ input: `${noise} ${phone} x@y.vn`, output: undefined }));
          const body = sentBody(fetchFn);
          return !body.includes(phone) && !body.includes('x@y.vn');
        },
      ),
      { numRuns: 50, seed: 7 },
    );
  });

  it.each([
    ['step', { step: 'draft 0912345678' }],
    ['model', { model: 'a@b.co' }],
    ['traceId', { traceId: 'x 0912345678' }],
    ['workspaceId', { workspaceId: '0912345678' }],
  ])('trường định danh %s không an toàn → từ chối, không gửi', async (_name, over) => {
    const { sink, fetchFn } = makeSink();
    await expect(sink.record(event(over))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('lỗi mạng không giữ cause', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('boom');
    });
    const { sink } = makeSink(fetchFn as never);
    const err = (await sink.record(event()).catch((e: Error) => e)) as Error;
    expect(err.cause).toBeUndefined();
  });

  it('HTTP lỗi → ném LLM_UNAVAILABLE, thông báo không chứa khóa/nội dung', async () => {
    const { sink } = makeSink(okFetch({}, 401));
    await expect(sink.record(event())).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    await sink.record(event()).catch((e: Error) => {
      expect(e.message).not.toContain(SECRET);
      expect(e.message).not.toContain('0912345678');
    });
  });

  it('207 nhưng có errors → ném lỗi', async () => {
    const { sink } = makeSink(okFetch({ successes: [], errors: [{ id: 'x' }] }));
    await expect(sink.record(event())).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
  });

  it('phản hồi không phải JSON vẫn coi là thành công khi HTTP ổn', async () => {
    const fetchFn = vi.fn(async () => new Response('khong-json', { status: 200 }));
    const { sink } = makeSink(fetchFn as never);
    await expect(sink.record(event())).resolves.toBeUndefined();
  });

  it('mạng lỗi → bọc thành LLM_UNAVAILABLE (không lộ nguyên nhân gốc ra message)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNRESET 0912345678');
    });
    const { sink } = makeSink(fetchFn as never);
    await expect(sink.record(event())).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    await sink.record(event()).catch((e: Error) => expect(e.message).not.toContain('0912345678'));
  });

  it('mặc định tạo id bằng randomUUID', async () => {
    const fetchFn = okFetch();
    const sink = createLangfuseTraceSink(
      { host: 'http://lf.test', publicKey: 'pk-test', secretKey: SECRET },
      { fetch: fetchFn as unknown as typeof fetch },
    );
    await sink.record(event());
    expect(sentBody(fetchFn)).toMatch(/"traceId":"[0-9a-f-]{36}"/);
  });

  it('dùng fetch toàn cục khi không tiêm', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const sink = createLangfuseTraceSink({
      host: 'http://lf.test',
      publicKey: 'pk-test',
      secretKey: SECRET,
    });
    await sink.record(event());
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe('FR-034 recordTraceSafely & factory', () => {
  it('sink ném lỗi lạ → nuốt, chỉ báo mã lỗi (không nội dung)', async () => {
    const onError = vi.fn();
    const sink = {
      record: async () => {
        throw new Error('boom 0912345678');
      },
    };
    await expect(recordTraceSafely(sink, event(), onError)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith('INTERNAL');
  });

  it('lỗi AppError giữ nguyên mã', async () => {
    const onError = vi.fn();
    const { sink } = makeSink(okFetch({}, 500));
    await recordTraceSafely(sink, event(), onError);
    expect(onError).toHaveBeenCalledWith('LLM_UNAVAILABLE');
  });

  it('không truyền onError vẫn không ném', async () => {
    const sink = { record: async () => Promise.reject(new Error('x')) };
    await expect(recordTraceSafely(sink, event())).resolves.toBeUndefined();
  });

  it('sink no-op không làm gì', async () => {
    await expect(createNoopTraceSink().record(event())).resolves.toBeUndefined();
  });

  it('createTraceSink: tắt → no-op, KHÔNG gọi fetch', async () => {
    const fetchFn = okFetch();
    const sink = createTraceSink({ enabled: false }, { fetch: fetchFn as unknown as typeof fetch });
    await sink.record(event());
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('createTraceSink: bật → gửi qua fetch tiêm vào', async () => {
    const fetchFn = okFetch();
    const sink = createTraceSink(
      { enabled: true, host: 'http://lf.test', publicKey: 'pk-test', secretKey: SECRET },
      { fetch: fetchFn as unknown as typeof fetch },
    );
    await sink.record(event());
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});

import { AppError } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import { createLiteLlmKeyAdmin, createMockKeyAdmin } from './admin';

const MASTER = 'mk-test';
const SPEC = {
  alias: 'cf-ws-x',
  maxBudgetUsd: 3,
  budgetDuration: '1mo',
  workspaceId: '0b6f2a3e-5d41-4c8e-9a10-7f3d2e1c4b5a',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('FR-034 client HTTP quản trị khóa LiteLLM', () => {
  it('generate: POST /key/generate bằng master key, thân đúng, trả khóa', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ key: 'vk-new' }));
    const admin = createLiteLlmKeyAdmin({
      baseUrl: 'http://litellm.test/',
      masterKey: MASTER,
      fetchImpl,
    });
    await expect(admin.generate(SPEC)).resolves.toEqual({ key: 'vk-new' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://litellm.test/key/generate');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${MASTER}`);
    expect(JSON.parse(init.body as string)).toEqual({
      key_alias: 'cf-ws-x',
      max_budget: 3,
      budget_duration: '1mo',
      metadata: { workspace_id: SPEC.workspaceId },
    });
  });

  it('update: POST /key/update với khóa + max_budget', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const admin = createLiteLlmKeyAdmin({ baseUrl: 'http://l.test', masterKey: MASTER, fetchImpl });
    await admin.update('vk-1', { maxBudgetUsd: 9 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://l.test/key/update');
    expect(JSON.parse(init.body as string)).toEqual({ key: 'vk-1', max_budget: 9 });
  });

  it('revoke: POST /key/delete với danh sách khóa', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const admin = createLiteLlmKeyAdmin({ baseUrl: 'http://l.test', masterKey: MASTER, fetchImpl });
    await admin.revoke('vk-1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://l.test/key/delete');
    expect(JSON.parse(init.body as string)).toEqual({ keys: ['vk-1'] });
  });

  it('lỗi HTTP → AppError, thông báo không chứa master key hay khóa', async () => {
    const admin = createLiteLlmKeyAdmin({
      baseUrl: 'http://l.test',
      masterKey: MASTER,
      fetchImpl: async () => jsonResponse({ error: `lộ ${MASTER} vk-1` }, 500),
    });
    const err = await admin.update('vk-1', { maxBudgetUsd: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(String((err as Error).message)).not.toContain(MASTER);
    expect(String((err as Error).message)).not.toContain('vk-1');
  });

  it('401/403 → CONFIG_INVALID; lỗi mạng → LLM_UNAVAILABLE', async () => {
    const make = (fetchImpl: typeof fetch) =>
      createLiteLlmKeyAdmin({ baseUrl: 'http://l.test', masterKey: MASTER, fetchImpl });
    const forbidden = await make(async () => jsonResponse({}, 403))
      .generate(SPEC)
      .catch((e: unknown) => e);
    expect((forbidden as AppError).code).toBe('CONFIG_INVALID');
    const down = await make(async () => {
      throw new TypeError(`connect ${MASTER}`);
    })
      .generate(SPEC)
      .catch((e: unknown) => e);
    expect((down as AppError).code).toBe('LLM_UNAVAILABLE');
    expect(String((down as Error).message)).not.toContain(MASTER);
  });

  it('generate: phản hồi thiếu key → LLM_UNAVAILABLE', async () => {
    const admin = createLiteLlmKeyAdmin({
      baseUrl: 'http://l.test',
      masterKey: MASTER,
      fetchImpl: async () => jsonResponse({ nope: 1 }),
    });
    const err = await admin.generate(SPEC).catch((e: unknown) => e);
    expect((err as AppError).code).toBe('LLM_UNAVAILABLE');
  });

  it('phản hồi không phải JSON → LLM_UNAVAILABLE', async () => {
    const admin = createLiteLlmKeyAdmin({
      baseUrl: 'http://l.test',
      masterKey: MASTER,
      fetchImpl: async () => new Response('không phải json', { status: 200 }),
    });
    const err = await admin.revoke('vk-1').catch((e: unknown) => e);
    expect((err as AppError).code).toBe('LLM_UNAVAILABLE');
  });

  it('thiếu baseUrl/masterKey → CONFIG_INVALID', () => {
    expect(() => createLiteLlmKeyAdmin({ baseUrl: '', masterKey: MASTER })).toThrow(AppError);
    expect(() => createLiteLlmKeyAdmin({ baseUrl: 'http://l.test', masterKey: '' })).toThrow(
      AppError,
    );
  });
});

describe('FR-034 admin giả (mock) cho test/dev', () => {
  it('cấp khóa riêng, theo dõi ngân sách và chi tiêu', async () => {
    const admin = createMockKeyAdmin();
    const a = await admin.generate({ ...SPEC, alias: 'a', maxBudgetUsd: 1 });
    const b = await admin.generate({ ...SPEC, alias: 'b', maxBudgetUsd: 1 });
    expect(a.key).not.toBe(b.key);
    admin.recordSpend(a.key, 1);
    expect(admin.isExhausted(a.key)).toBe(true);
    expect(admin.isExhausted(b.key)).toBe(false);
    await admin.update(a.key, { maxBudgetUsd: 2 });
    expect(admin.isExhausted(a.key)).toBe(false);
    await admin.revoke(a.key);
    expect(admin.has(a.key)).toBe(false);
    expect(admin.generateCount).toBe(2);
  });

  it('update/revoke khóa không tồn tại → NOT_FOUND', async () => {
    const admin = createMockKeyAdmin();
    await expect(admin.update('vk-zzz', { maxBudgetUsd: 1 })).rejects.toBeInstanceOf(AppError);
    await expect(admin.revoke('vk-zzz')).rejects.toBeInstanceOf(AppError);
  });
});

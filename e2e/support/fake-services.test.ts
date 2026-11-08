import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFakeLitellm,
  draftReply,
  extractReply,
  labelFor,
} from '../fake-services/fake-litellm.mjs';
import { createFakeMl, FAKE_ML_MODEL } from '../fake-services/fake-ml.mjs';

/** Dịch vụ giả CHỈ cho CI/E2E: kiểm giao thức và đầu ra cố định (không phải số đo chất lượng). */
let llm: Server;
let ml: Server;
let llmUrl: string;
let mlUrl: string;

const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    ),
  );

beforeAll(async () => {
  llm = createFakeLitellm();
  ml = createFakeMl();
  [llmUrl, mlUrl] = await Promise.all([listen(llm), listen(ml)]);
});
afterAll(() => {
  llm.close();
  ml.close();
});

const chat = (step: string, content: string) =>
  fetch(`${llmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'm',
      messages: [{ role: 'user', content }],
      metadata: { step, prompt_version: 'x@1' },
    }),
  });

describe('dịch vụ LLM giả (OpenAI/LiteLLM chat completions)', () => {
  it('extract: JSON cố định, nhãn theo từ khóa', async () => {
    const body = await (await chat('extract', 'Áo này giá bao nhiêu?')).json();
    const out = JSON.parse(body.choices[0].message.content);
    expect(out.labels).toEqual([{ label: 'price' }]);
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    expect(labelFor('chốt đơn nhé')).toBe('purchase');
    expect(labelFor('xin chào')).toBe('advice');
    expect(extractReply('x').asks).toEqual([]);
  });

  it('draft: lấy id nguồn đầu tiên trong prompt; không có nguồn → xin chuyển nhân viên', async () => {
    const withSource = await (
      await chat('draft', 'a\n<source id="faq:123" kind="faq">\nnội dung\n</source>')
    ).json();
    const out = JSON.parse(withSource.choices[0].message.content);
    expect(out).toMatchObject({ needs_human: false, sources: ['faq:123'] });
    expect(out.claims[0].source_ids).toEqual(['faq:123']);
    expect(draftReply('không có nguồn').needs_human).toBe(true);
  });

  it('bước lạ → HTTP 400 (không đoán); đường lạ → 404', async () => {
    expect((await chat('rewrite', 'x')).status).toBe(400);
    expect((await fetch(`${llmUrl}/khac`, { method: 'POST' })).status).toBe(404);
  });
});

describe('dịch vụ /embed giả', () => {
  const embed = (texts: unknown) =>
    fetch(`${mlUrl}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts }),
    });

  it('vector 1024 chiều, xác định theo văn bản, model bge-m3-test', async () => {
    const a = await (await embed(['ship', 'đổi trả'])).json();
    const b = await (await embed(['ship'])).json();
    expect(a.model).toBe(FAKE_ML_MODEL);
    expect(a.dimensions).toBe(1024);
    expect(a.vectors).toHaveLength(2);
    expect(a.vectors[0]).toHaveLength(1024);
    expect(a.vectors[0]).toEqual(b.vectors[0]);
    expect(a.vectors[0]).not.toEqual(a.vectors[1]);
  });

  it('thiếu texts → 400', async () => {
    expect((await embed('không phải mảng')).status).toBe(400);
  });
});

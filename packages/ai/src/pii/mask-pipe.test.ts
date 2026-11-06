import type { ExtractedContacts, MaskedText } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import {
  type ContactSink,
  fillOrderIntentPhone,
  maskAndCapture,
  maskForTrace,
  PII_SAVE_FAILED,
} from './mask-pipe';

const WS = '00000000-0000-4000-8000-000000000001';
const noop = async (): Promise<void> => undefined;

function sinkOf(save: ContactSink['save']): ContactSink {
  return { save };
}

describe('FR-033 maskAndCapture', () => {
  it('lưu liên hệ GỐC trước khi trả văn bản đã che', async () => {
    const calls: string[] = [];
    const sink = sinkOf(async (_ws, contacts) => {
      calls.push(`save:${contacts.phones.join(',')}|${contacts.emails.join(',')}`);
    });
    const out = await maskAndCapture(
      { workspaceId: WS, sourceId: 'c1', text: 'ib 0912345678 / a@b.co nhé' },
      sink,
    );
    calls.push('returned');
    expect(calls).toEqual(['save:0912345678|a@b.co', 'returned']);
    expect(out.masked).toBe('ib [sđt] / [email] nhé');
    expect(out).toMatchObject({ saved: true, contacts: { phones: ['0912345678'] } });
  });

  it('truyền workspaceId và mã nguồn cho nơi lưu', async () => {
    const save = vi.fn(noop);
    await maskAndCapture({ workspaceId: WS, sourceId: 'c9', text: '0912345678' }, sinkOf(save));
    expect(save).toHaveBeenCalledWith(
      WS,
      { phones: ['0912345678'], emails: [] },
      { sourceId: 'c9' },
    );
  });

  it('không có liên hệ → không gọi nơi lưu, văn bản giữ nguyên', async () => {
    const save = vi.fn(noop);
    const out = await maskAndCapture(
      { workspaceId: WS, text: 'Áo còn size M không?' },
      sinkOf(save),
    );
    expect(save).not.toHaveBeenCalled();
    expect(out).toMatchObject({ masked: 'Áo còn size M không?', saved: true });
  });

  it('lưu lỗi → vẫn trả bản đã che (không bao giờ bản gốc), saved=false + mã lỗi', async () => {
    const sink = sinkOf(async () => {
      throw new Error('DB down 0912345678');
    });
    const out = await maskAndCapture({ workspaceId: WS, text: 'sđt 0912345678' }, sink);
    expect(out.masked).toBe('sđt [sđt]');
    expect(out.saved).toBe(false);
    expect(out.errorCode).toBe(PII_SAVE_FAILED);
    expect(JSON.stringify(out)).not.toContain('DB down');
  });

  it('lỗi không phải Error (ném chuỗi) cũng được xử lý như lưu lỗi', async () => {
    const sink = sinkOf(async () => {
      throw 'x';
    });
    const out = await maskAndCapture({ workspaceId: WS, text: 'a@b.co' }, sink);
    expect(out).toMatchObject({ masked: '[email]', saved: false, errorCode: PII_SAVE_FAILED });
  });

  describe('property', () => {
    const phone = fc
      .tuple(
        fc.constantFrom('0', '+84', '84'),
        fc.constantFrom('3', '5', '7', '8', '9'),
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 }),
        fc.constantFrom('', ' ', '.', '-'),
      )
      .map(([p, h, d, sep]) => `${p}${sep}${h}${d[0]}${sep}${d.slice(1).join('')}`);
    const email = fc
      .tuple(fc.stringMatching(/^[a-z0-9]{1,8}$/), fc.stringMatching(/^[a-z0-9]{1,8}$/))
      .map(([u, d]) => `${u}@${d}.com`);
    const word = fc.constantFrom('ib', 'giá', 'shop', 'ơi', 'size', 'M', 'còn', 'không');

    it('mọi SĐT/email chèn vào đều được lấy ra và không còn trong bản che; lũy đẳng', async () => {
      await fc.assert(
        fc.asyncProperty(phone, email, word, word, async (p, e, w1, w2) => {
          const saved: ExtractedContacts[] = [];
          const out = await maskAndCapture(
            { workspaceId: WS, text: `${w1} ${p} ${w2} ${e}` },
            sinkOf(async (_w, c) => {
              saved.push(c);
            }),
          );
          expect(saved).toHaveLength(1);
          expect(saved[0]?.emails).toEqual([e]);
          expect(saved[0]?.phones).toHaveLength(1);
          expect(out.masked).not.toContain(e);
          expect(out.masked).not.toMatch(/\d{9}/);
          expect(out.masked).toBe(`${w1} [sđt] ${w2} [email]`);
          const again = await maskAndCapture({ workspaceId: WS, text: out.masked }, sinkOf(noop));
          expect(again.masked).toBe(out.masked);
          expect(again.contacts).toEqual({ phones: [], emails: [] });
        }),
        { seed: 20261106, numRuns: 200 },
      );
    });

    it('văn bản chữ thường không số/@ thì không đổi', async () => {
      await fc.assert(
        fc.asyncProperty(fc.stringMatching(/^[a-zà-ỹ ]{0,40}$/), async (t) => {
          const out = await maskAndCapture({ workspaceId: WS, text: t }, sinkOf(noop));
          expect(out.masked).toBe(t);
        }),
        { seed: 20261106 },
      );
    });
  });
});

describe('FR-033 maskForTrace', () => {
  it('che chuỗi và mọi chuỗi lồng trong object/mảng; giữ số/boolean/null', () => {
    const out = maskForTrace({
      input: 'gọi 0912345678',
      meta: { list: ['a@b.co', 'ok'], n: 3, flag: true, none: null },
    });
    expect(out).toEqual({
      input: 'gọi [sđt]',
      meta: { list: ['[email]', 'ok'], n: 3, flag: true, none: null },
    });
  });

  it('chuỗi trần trả đúng kiểu MaskedText', () => {
    const s: MaskedText = maskForTrace('0912345678');
    expect(s).toBe('[sđt]');
  });

  it('vòng tham chiếu không làm sập; tham chiếu chung không vòng vẫn được che', () => {
    const loop: Record<string, unknown> = { t: '0912345678' };
    loop.self = loop;
    expect(maskForTrace(loop)).toEqual({ t: '[sđt]', self: '[circular]' });
    const shared = { p: 'a@b.co' };
    expect(maskForTrace({ a: shared, b: shared })).toEqual({
      a: { p: '[email]' },
      b: { p: '[email]' },
    });
  });

  it('Date → chuỗi ISO; Map/Buffer/String bọc → [unsupported]; số là SĐT bị che', () => {
    const d = new Date('2026-11-06T00:00:00.000Z');
    expect(maskForTrace({ d })).toEqual({ d: '2026-11-06T00:00:00.000Z' });
    expect(maskForTrace({ m: new Map([['k', '0912345678']]) })).toEqual({ m: '[unsupported]' });
    expect(maskForTrace({ b: Buffer.from('0912345678') })).toEqual({ b: '[unsupported]' });
    expect(maskForTrace({ s: new String('0912345678') })).toEqual({ s: '[unsupported]' });
    expect(maskForTrace({ n: 84912345678, ok: 12 })).toEqual({ n: '[sđt]', ok: 12 });
  });

  it('khóa của object cũng được che; undefined giữ nguyên', () => {
    expect(maskForTrace({ 'a@b.co': undefined })).toEqual({ '[email]': undefined });
  });

  it('mọi chuỗi chứa SĐT sinh ngẫu nhiên đều bị che ở độ sâu bất kỳ', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('0912345678', '+84987654321'), { minLength: 1 }),
        (ps) => {
          const out = JSON.stringify(maskForTrace({ a: { b: ps.map((p) => `x ${p}`) } }));
          expect(out).not.toMatch(/\d{9}/);
        },
      ),
      { seed: 20261106 },
    );
  });
});

describe('FR-033 fillOrderIntentPhone', () => {
  const base = (orderIntent: ExtractResult['order_intent']): ExtractResult => ({
    labels: [{ label: 'purchase', confidence: 0.9 }],
    product_mentions: [],
    refers_to_image: false,
    size: null,
    color: null,
    height_cm: null,
    weight_kg: null,
    qty: null,
    cited_price_vnd: null,
    order_intent: orderIntent,
    asks: [],
  });

  it('điền số đầu tiên vào order_intent.phone', () => {
    const r = fillOrderIntentPhone(base({ items: ['áo'], phone: null, address: null }), {
      phones: ['0912345678', '0987654321'],
      emails: [],
    });
    expect(r.order_intent?.phone).toBe('0912345678');
  });

  it('không có order_intent hoặc không có số → trả nguyên', () => {
    const none = base(null);
    expect(fillOrderIntentPhone(none, { phones: ['0912345678'], emails: [] })).toBe(none);
    const noPhone = base({ items: [], phone: null, address: null });
    expect(fillOrderIntentPhone(noPhone, { phones: [], emails: [] })).toBe(noPhone);
  });

  it('không sửa đối tượng đầu vào (bất biến)', () => {
    const input = base({ items: [], phone: null, address: 'x' });
    fillOrderIntentPhone(input, { phones: ['0912345678'], emails: [] });
    expect(input.order_intent?.phone).toBeNull();
  });
});

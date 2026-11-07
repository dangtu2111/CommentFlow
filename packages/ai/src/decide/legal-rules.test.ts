import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideAction } from './decide-action';
import {
  checkDraftLegal,
  detectLegalTopics,
  evaluateLegalRules,
  LEGAL_TOPICS,
  type LegalTopic,
} from './legal-rules';

const src = (id: string, text: string) => ({ id, text });

describe('FR-160 nhận ra nhóm cam kết pháp lý/uy tín', () => {
  it.each<[string, LegalTopic]>([
    ['Hàng này chính hãng không shop?', 'authenticity'],
    ['hang chinh hang ko ban', 'authenticity'],
    ['Is it authentic or fake?', 'authenticity'],
    ['Có xuất hóa đơn không?', 'invoice'],
    ['cho minh xin hoa don vat', 'invoice'],
    ['Do you issue a VAT invoice', 'invoice'],
    ['Bảo hành bao lâu vậy', 'warranty'],
    ['warranty?', 'warranty'],
    ['Nguồn gốc xuất xứ ở đâu', 'origin'],
    ['made in where', 'origin'],
    ['Không ưng có hoàn tiền không', 'refund'],
    ['doi tra trong may ngay', 'refund'],
    ['refund policy?', 'refund'],
  ])('FR-160 "%s" → %s', (text, topic) => {
    expect(detectLegalTopics(text)).toContain(topic);
  });

  it('FR-160 "vật liệu" không bị nhận nhầm là VAT; câu thường không có nhóm', () => {
    expect(detectLegalTopics('Vật liệu gì vậy shop')).toEqual([]);
    expect(detectLegalTopics('Áo này còn size M không')).toEqual([]);
  });

  it('FR-160 trả đúng thứ tự cố định, không trùng', () => {
    const all = detectLegalTopics('bảo hành, hoàn tiền, chính hãng, VAT, nguồn gốc, bảo hành');
    expect(all).toEqual([...LEGAL_TOPICS]);
  });
});

describe('FR-160 evaluateLegalRules — khách hỏi, nguồn phải có', () => {
  it('FR-160 không hỏi nhóm pháp lý → không cờ', () => {
    const out = evaluateLegalRules({ customerText: 'Còn size M không', sources: [] });
    expect(out).toMatchObject({ asked: [], unsourced: [], legalUnsourced: false, readable: true });
  });

  it('FR-160 hỏi chính hãng, kho không nhắc → legalUnsourced', () => {
    const out = evaluateLegalRules({
      customerText: 'Hàng chính hãng không?',
      sources: [src('a', 'Áo thun cotton, giặt máy được')],
    });
    expect(out.legalUnsourced).toBe(true);
    expect(out.unsourced).toEqual(['authenticity']);
  });

  it('FR-160 nguồn nói nhóm khác không mở nhóm này', () => {
    const out = evaluateLegalRules({
      customerText: 'Có VAT không, bảo hành sao?',
      sources: [src('a', 'Bảo hành 12 tháng')],
    });
    expect(out.sourced).toEqual(['warranty']);
    expect(out.unsourced).toEqual(['invoice']);
    expect(out.legalUnsourced).toBe(true);
  });

  it('FR-160 đủ nguồn từng nhóm → không cờ', () => {
    const out = evaluateLegalRules({
      customerText: 'chính hãng không, bảo hành bao lâu',
      sources: [src('a', 'Cam kết hàng chính hãng 100%'), src('b', 'Bảo hành 12 tháng')],
    });
    expect(out.legalUnsourced).toBe(false);
    expect(out.sourced).toEqual(['authenticity', 'warranty']);
  });

  it('FR-160 nguồn rỗng/chỉ khoảng trắng không tính', () => {
    const out = evaluateLegalRules({ customerText: 'bảo hành?', sources: [src('a', '   ')] });
    expect(out.legalUnsourced).toBe(true);
  });

  it.each([null, 42, 'x', { customerText: 5, sources: [] }, { customerText: 'a', sources: 'x' }])(
    'FR-160 đầu vào hỏng %j → đóng khi lỗi',
    (raw) => {
      const out = evaluateLegalRules(raw);
      expect(out.legalUnsourced).toBe(true);
      expect(out.readable).toBe(false);
    },
  );

  it('FR-160 cờ nối decideAction → chuyển người legal_unsourced', () => {
    const risk = evaluateLegalRules({ customerText: 'có hoàn tiền không', sources: [] });
    const decision = decideAction({
      lang: 'vi',
      extract: {
        labels: [{ label: 'other' }],
        refers_to_image: false,
        size: null,
        color: null,
        height_cm: null,
        weight_kg: null,
      },
      products: { candidates: ['Áo A'], missingAxes: [] },
      topics: [{ topic: 'policy', sourced: false }],
      thread: { clarifyCount: 0, repeatCount: 0 },
      risks: {
        priceConflict: false,
        legalUnsourced: risk.legalUnsourced,
        impersonation: false,
        stockStale: false,
        injectionSuspected: false,
      },
    });
    expect(decision).toMatchObject({ action: 'handoff', reason: 'legal_unsourced' });
  });
});

describe('FR-160 checkDraftLegal — bản nháp AI không khẳng định bừa', () => {
  it('FR-160 nháp không nhắc nhóm pháp lý → ok', () => {
    expect(checkDraftLegal({ draftText: 'Dạ còn size M ạ', sources: [] })).toEqual({
      ok: true,
      mentioned: [],
      unsourced: [],
      unsourcedDurations: [],
    });
  });

  it('FR-160 nháp khẳng định chính hãng, không nguồn → chặn', () => {
    const out = checkDraftLegal({ draftText: 'Shop cam kết hàng chính hãng ạ', sources: [] });
    expect(out.ok).toBe(false);
    expect(out.unsourced).toEqual(['authenticity']);
  });

  it('FR-160 nháp có nguồn cùng nhóm → ok', () => {
    const out = checkDraftLegal({
      draftText: 'Dạ shop có xuất hóa đơn VAT ạ',
      sources: [src('a', 'Shop xuất hóa đơn VAT theo yêu cầu')],
    });
    expect(out.ok).toBe(true);
  });

  it('FR-160 thời hạn bảo hành không có trong nguồn → chặn', () => {
    const out = checkDraftLegal({
      draftText: 'Bảo hành 24 tháng ạ',
      sources: [src('a', 'Bảo hành 12 tháng')],
    });
    expect(out.ok).toBe(false);
    expect(out.unsourcedDurations).toEqual(['24 thang']);
  });

  it('FR-160 thời hạn khớp nguồn (khác dấu/hoa thường) → ok', () => {
    const out = checkDraftLegal({
      draftText: 'Hoàn tiền trong 7 NGÀY nhé',
      sources: [src('a', 'Hoàn tiền trong vòng 7 ngày kể từ khi nhận hàng')],
    });
    expect(out.ok).toBe(true);
  });

  it('FR-160 thời hạn chỉ lấy từ nguồn CÙNG nhóm, không mượn nguồn nhóm khác', () => {
    const out = checkDraftLegal({
      draftText: 'Bảo hành 12 tháng',
      sources: [src('a', 'Bảo hành có điều kiện'), src('b', 'Giao hàng trong 12 tháng')],
    });
    expect(out.ok).toBe(false);
  });

  it('FR-160 thời hạn khi nháp không nhắc nhóm pháp lý → bỏ qua', () => {
    expect(checkDraftLegal({ draftText: 'Giao trong 3 ngày ạ', sources: [] }).ok).toBe(true);
  });

  it('FR-160 đầu vào hỏng → chặn', () => {
    expect(checkDraftLegal(7).ok).toBe(false);
  });
});

describe('FR-160 property-based', () => {
  const sourceArb = fc.record({ id: fc.string(), text: fc.string() });

  it('FR-160 không bao giờ ném với đầu vào bất kỳ', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        evaluateLegalRules(raw);
        checkDraftLegal(raw);
        return true;
      }),
    );
  });

  it('FR-160 không nguồn: cờ bật ⇔ có nhóm được hỏi', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const out = evaluateLegalRules({ customerText: text, sources: [] });
        return out.legalUnsourced === detectLegalTopics(text).length > 0;
      }),
    );
  });

  it('FR-160 thêm nguồn không nhắc nhóm nào không bao giờ gỡ cờ', () => {
    fc.assert(
      fc.property(fc.string(), fc.array(sourceArb, { maxLength: 4 }), (text, sources) => {
        const neutral = sources.filter((s) => detectLegalTopics(s.text).length === 0);
        const base = evaluateLegalRules({ customerText: text, sources: [] });
        const out = evaluateLegalRules({ customerText: text, sources: neutral });
        return out.legalUnsourced === base.legalUnsourced;
      }),
    );
  });

  it('FR-160 nguồn nhắc đủ mọi nhóm được hỏi thì gỡ cờ', () => {
    const full = src('all', 'chính hãng, hóa đơn VAT, bảo hành, nguồn gốc, hoàn tiền');
    fc.assert(
      fc.property(fc.string(), (text) => {
        return !evaluateLegalRules({ customerText: text, sources: [full] }).legalUnsourced;
      }),
    );
  });

  it('FR-160 nháp nhắc nhóm + không nguồn ⇒ luôn chặn', () => {
    const word: Record<LegalTopic, string> = {
      authenticity: 'chính hãng',
      invoice: 'hóa đơn',
      warranty: 'bảo hành',
      origin: 'nguồn gốc',
      refund: 'hoàn tiền',
    };
    fc.assert(
      fc.property(fc.string(), fc.constantFrom(...LEGAL_TOPICS), (pad, topic) => {
        return !checkDraftLegal({ draftText: `${pad} ${word[topic]}`, sources: [] }).ok;
      }),
    );
  });
});

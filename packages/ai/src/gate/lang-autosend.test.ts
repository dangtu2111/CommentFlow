import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLD, decideAutoSend, THRESHOLD_FLOOR } from './auto-send-gate';
import {
  type AutoSendByLangInput,
  decideAutoSendByLang,
  type LangCell,
  resolveLangLevel,
  resolveLangSettings,
  resolveReplyLang,
} from './lang-autosend';

describe('FR-120 resolveReplyLang', () => {
  it('kênh auto → theo ngôn ngữ nhận diện', () => {
    expect(resolveReplyLang({ detected: 'en', channelReplyLanguage: 'auto' })).toBe('en');
    expect(resolveReplyLang({ detected: 'vi', channelReplyLanguage: 'auto' })).toBe('vi');
  });
  it('kênh cố định vi/en thắng ngôn ngữ nhận diện', () => {
    expect(resolveReplyLang({ detected: 'en', channelReplyLanguage: 'vi' })).toBe('vi');
    expect(resolveReplyLang({ detected: 'vi', channelReplyLanguage: 'en' })).toBe('en');
  });
  it('ngôn ngữ ngoài vi/en luôn là other (FR-159), dù kênh cố định', () => {
    expect(resolveReplyLang({ detected: 'other', channelReplyLanguage: 'vi' })).toBe('other');
    expect(resolveReplyLang({ detected: 'other', channelReplyLanguage: 'auto' })).toBe('other');
  });
  it('giá trị lạ → other (chặn)', () => {
    expect(resolveReplyLang({ detected: 'fr', channelReplyLanguage: 'auto' })).toBe('other');
    expect(resolveReplyLang({ detected: 'vi', channelReplyLanguage: 'xx' })).toBe('other');
  });
});

describe('FR-120 resolveLangLevel', () => {
  const cells: LangCell[] = [
    { lang: 'all', mode: 'auto' },
    { lang: 'en', mode: 'shadow' },
  ];
  it('ô riêng ngôn ngữ thắng ô all', () => {
    expect(resolveLangLevel(cells, 'en')).toBe('shadow');
    expect(resolveLangLevel(cells, 'vi')).toBe('auto');
  });
  it('không có ô → off', () => {
    expect(resolveLangLevel([], 'vi')).toBe('off');
  });
  it('other → off dù có ô all = auto', () => {
    expect(resolveLangLevel(cells, 'other')).toBe('off');
  });
  it('ô riêng off thắng ô all auto', () => {
    expect(resolveLangLevel([...cells, { lang: 'vi', mode: 'off' }], 'vi')).toBe('off');
  });
  it('ô trùng phạm vi → mức chặt nhất, không phụ thuộc thứ tự', () => {
    const dup: LangCell[] = [
      { lang: 'vi', mode: 'auto' },
      { lang: 'vi', mode: 'off' },
    ];
    expect(resolveLangLevel(dup, 'vi')).toBe('off');
    expect(resolveLangLevel([...dup].reverse(), 'vi')).toBe('off');
  });
});

describe('FR-120 resolveLangSettings', () => {
  const base = { threshold: 0.85, dailyCap: 50 };
  it('không ghi đè → giữ cấu hình chung', () => {
    expect(resolveLangSettings(base, 'vi', {})).toEqual(base);
  });
  it('ghi đè riêng theo ngôn ngữ', () => {
    expect(resolveLangSettings(base, 'en', { en: { threshold: 0.95, dailyCap: 10 } })).toEqual({
      threshold: 0.95,
      dailyCap: 10,
    });
  });
  it('ngưỡng ghi đè thấp hơn sàn → nâng lên sàn', () => {
    expect(
      resolveLangSettings({ threshold: 0.1, dailyCap: 5 }, 'en', { en: { threshold: 0.1 } })
        .threshold,
    ).toBe(THRESHOLD_FLOOR);
  });
  it('ghi đè chỉ siết thêm: ngưỡng thấp hơn / giới hạn cao hơn cấu hình chung bị bỏ', () => {
    expect(resolveLangSettings(base, 'en', { en: { threshold: 0.8, dailyCap: 500 } })).toEqual(
      base,
    );
  });
  it('property: ngưỡng luôn ≥ sàn', () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 2, noNaN: true }), (t) => {
        expect(
          resolveLangSettings({ threshold: t, dailyCap: 5 }, 'vi', {}).threshold,
        ).toBeGreaterThanOrEqual(THRESHOLD_FLOOR);
      }),
    );
  });
});

const NOW = '2026-11-06T03:00:00.000Z'; // 10:00 thứ Sáu giờ Việt Nam

function gateBase(over: Record<string, unknown> = {}) {
  return {
    target: 'comment',
    now: NOW,
    workspace: { aiEnabled: true, emergencyStopped: false, aiCostCapUsd: 50, aiCostMonthUsd: 10 },
    levels: { channelLabel: 'auto', post: null },
    settings: {
      threshold: DEFAULT_THRESHOLD,
      dailyCap: 100,
      blockedLabels: ['complaint'],
      blockedKeywords: [],
      allowPartial: false,
      allowClarify: true,
      activeHours: null,
    },
    labels: ['price'],
    confidence: 0.9,
    decision: {
      action: 'answer',
      needsHuman: false,
      autoSendPolicy: 'standard',
      unansweredTopics: [],
    },
    draft: {
      reply: 'Dạ áo thun A giá 199.000đ ạ.',
      needsHuman: false,
      claims: [{ kind: 'fact' }],
      unansweredTopics: [],
    },
    grounding: { sourceTexts: ['Áo thun A: 199.000đ'] },
    flags: {
      customerAngry: false,
      promptInjection: false,
      repeatCount: 0,
      imageProductUnresolved: false,
      humanHolding: false,
      readinessPercent: 95,
    },
    usage: { autoSentToday: 0 },
    message: null,
    ...over,
  } as unknown as AutoSendByLangInput['gate'];
}

function input(over: Partial<AutoSendByLangInput> = {}): AutoSendByLangInput {
  return {
    lang: {
      detected: 'vi',
      channelReplyLanguage: 'auto',
      draftLang: 'vi',
      evaluatedLangs: ['vi', 'en'],
    },
    cells: [{ lang: 'all', mode: 'auto' }],
    overrides: {},
    gate: gateBase(),
    ...over,
  };
}

describe('FR-120 decideAutoSendByLang — tự gửi theo ngôn ngữ', () => {
  it('vi, đã đánh giá, ô auto → auto_send', () => {
    expect(decideAutoSendByLang(input())).toMatchObject({ outcome: 'auto_send', replyLang: 'vi' });
  });

  it('ngôn ngữ other → hold lang_other, không gọi tự gửi', () => {
    const r = decideAutoSendByLang(
      input({
        lang: {
          detected: 'other',
          channelReplyLanguage: 'auto',
          draftLang: 'other',
          evaluatedLangs: ['vi', 'en'],
        },
      }),
    );
    expect(r).toMatchObject({ outcome: 'hold', failedGate: 'lang', reason: 'lang_other' });
  });

  it('nháp lệch ngôn ngữ trả lời → hold', () => {
    const r = decideAutoSendByLang(
      input({
        lang: {
          detected: 'en',
          channelReplyLanguage: 'auto',
          draftLang: 'vi',
          evaluatedLangs: ['vi', 'en'],
        },
      }),
    );
    expect(r).toMatchObject({ outcome: 'hold', reason: 'reply_lang_mismatch' });
  });

  it('kênh cố định en, khách viết vi, nháp en → khớp, tiếp tục cổng', () => {
    const r = decideAutoSendByLang(
      input({
        lang: {
          detected: 'vi',
          channelReplyLanguage: 'en',
          draftLang: 'en',
          evaluatedLangs: ['vi', 'en'],
        },
      }),
    );
    expect(r).toMatchObject({ outcome: 'auto_send', replyLang: 'en' });
  });

  it('ngôn ngữ chưa đạt đánh giá: auto → would_send (không tự gửi)', () => {
    const r = decideAutoSendByLang(
      input({
        lang: {
          detected: 'en',
          channelReplyLanguage: 'auto',
          draftLang: 'en',
          evaluatedLangs: ['vi'],
        },
      }),
    );
    expect(r).toMatchObject({ outcome: 'would_send', replyLang: 'en', langEvalCapped: true });
  });

  it('ô en tắt, ô all auto → en hold mode_off, vi vẫn auto', () => {
    const cells: LangCell[] = [
      { lang: 'all', mode: 'auto' },
      { lang: 'en', mode: 'off' },
    ];
    const en = decideAutoSendByLang(
      input({
        cells,
        lang: {
          detected: 'en',
          channelReplyLanguage: 'auto',
          draftLang: 'en',
          evaluatedLangs: ['vi', 'en'],
        },
      }),
    );
    expect(en).toMatchObject({ outcome: 'hold', failedGate: 'gate:2', reason: 'mode_off' });
    expect(decideAutoSendByLang(input({ cells })).outcome).toBe('auto_send');
  });

  it('ngưỡng riêng theo ngôn ngữ: en 0.95 chặn độ tin cậy 0.9, vi vẫn qua', () => {
    const overrides = { en: { threshold: 0.95 } };
    const en = decideAutoSendByLang(
      input({
        overrides,
        lang: {
          detected: 'en',
          channelReplyLanguage: 'auto',
          draftLang: 'en',
          evaluatedLangs: ['vi', 'en'],
        },
      }),
    );
    expect(en).toMatchObject({ outcome: 'hold', reason: 'confidence_below_threshold' });
    expect(decideAutoSendByLang(input({ overrides })).outcome).toBe('auto_send');
  });

  it('giới hạn/ngày riêng theo ngôn ngữ', () => {
    const r = decideAutoSendByLang(
      input({
        overrides: { vi: { dailyCap: 3 } },
        gate: gateBase({ usage: { autoSentToday: 3 } }),
      }),
    );
    expect(r).toMatchObject({ outcome: 'hold', reason: 'daily_cap_reached' });
  });

  it('ghi đè bài viết off vẫn chặn', () => {
    const r = decideAutoSendByLang(
      input({ gate: gateBase({ levels: { channelLabel: 'auto', post: 'off' } }) }),
    );
    expect(r).toMatchObject({ outcome: 'hold', reason: 'post_override_off' });
  });

  it('Chạy thử theo ô ngôn ngữ → would_send', () => {
    const r = decideAutoSendByLang(input({ cells: [{ lang: 'vi', mode: 'shadow' }] }));
    expect(r.outcome).toBe('would_send');
  });
});

describe('FR-147 hỏi lại / chuyển hướng qua cổng tự gửi', () => {
  const clarify = (over: Record<string, unknown> = {}, lang: 'vi' | 'en' = 'vi') =>
    input({
      lang: {
        detected: lang,
        channelReplyLanguage: 'auto',
        draftLang: lang,
        evaluatedLangs: ['vi', 'en'],
      },
      gate: gateBase({
        decision: {
          action: 'clarify',
          needsHuman: false,
          autoSendPolicy: 'allow_clarify',
          unansweredTopics: [],
        },
        draft: {
          reply:
            lang === 'vi' ? 'Chị lấy size S, M hay L ạ?' : 'Which size would you like: S, M or L?',
          needsHuman: false,
          claims: [{ kind: 'question_back' }],
          unansweredTopics: [],
        },
        grounding: { sourceTexts: [] },
        ...over,
      }),
    });

  for (const lang of ['vi', 'en'] as const) {
    it(`clarify không có fact, allow_clarify bật → auto_send (${lang})`, () => {
      expect(decideAutoSendByLang(clarify({}, lang)).outcome).toBe('auto_send');
    });
  }

  it('allow_clarify tắt → hold clarify_not_allowed', () => {
    const g = gateBase({
      decision: {
        action: 'clarify',
        needsHuman: false,
        autoSendPolicy: 'allow_clarify',
        unansweredTopics: [],
      },
      draft: {
        reply: 'Chị lấy size nào ạ?',
        needsHuman: false,
        claims: [{ kind: 'question_back' }],
        unansweredTopics: [],
      },
      grounding: { sourceTexts: [] },
    });
    const withOff = { ...g, settings: { ...g.settings, allowClarify: false } };
    expect(decideAutoSendByLang(input({ gate: withOff })).reason).toBe('clarify_not_allowed');
  });

  it('redirect kèm chủ đề chưa có nguồn cần allow_partial', () => {
    const r = decideAutoSendByLang(
      clarify({
        decision: {
          action: 'redirect',
          needsHuman: false,
          autoSendPolicy: 'allow_partial',
          unansweredTopics: ['phí ship'],
        },
      }),
    );
    expect(r).toMatchObject({ outcome: 'hold', reason: 'partial_not_allowed' });
  });

  it('handoff không bao giờ tự gửi', () => {
    const r = decideAutoSendByLang(
      clarify({
        decision: {
          action: 'handoff',
          needsHuman: true,
          autoSendPolicy: 'never',
          unansweredTopics: [],
        },
      }),
    );
    expect(r).toMatchObject({ outcome: 'hold', reason: 'handoff_action' });
  });
});

describe('property: lớp ngôn ngữ chỉ chặn thêm, không mở cổng', () => {
  const langArb = fc.constantFrom('vi', 'en', 'other');
  const modeArb = fc.constantFrom('off', 'shadow', 'auto');
  const cellArb = fc.record({ lang: fc.constantFrom('all', 'vi', 'en'), mode: modeArb });

  it('auto_send ⇒ ngôn ngữ vi/en, khớp nháp, đã đánh giá, ô = auto, cổng gốc cũng auto_send', () => {
    fc.assert(
      fc.property(
        langArb,
        fc.constantFrom('auto', 'vi', 'en'),
        langArb,
        fc.subarray(['vi', 'en']),
        fc.array(cellArb, { maxLength: 4 }),
        (detected, channelReplyLanguage, draftLang, evaluatedLangs, cells) => {
          const i = input({
            lang: { detected, channelReplyLanguage, draftLang, evaluatedLangs },
            cells: cells as LangCell[],
          });
          const r = decideAutoSendByLang(i);
          if (r.outcome !== 'auto_send') return;
          const reply = resolveReplyLang({ detected, channelReplyLanguage });
          expect(['vi', 'en']).toContain(reply);
          expect(draftLang).toBe(reply);
          expect(evaluatedLangs).toContain(reply);
          expect(resolveLangLevel(cells as LangCell[], reply)).toBe('auto');
          const raw = { ...i.gate, levels: { channelLabel: 'auto', post: null } };
          expect(decideAutoSend(raw).outcome).toBe('auto_send');
        },
      ),
    );
  });

  it('trần kênh × nhãn của người gọi không bị lớp ngôn ngữ nâng lên', () => {
    const off = gateBase({ levels: { channelLabel: 'off', post: null } });
    expect(decideAutoSendByLang(input({ gate: off }))).toMatchObject({
      outcome: 'hold',
      reason: 'mode_off',
    });
    const shadow = gateBase({ levels: { channelLabel: 'shadow', post: null } });
    expect(decideAutoSendByLang(input({ gate: shadow })).outcome).toBe('would_send');
  });

  it('cấu hình chung hỏng/thiếu → hold input, không "chữa" thành hợp lệ', () => {
    const g = gateBase();
    const noCap = { ...g, settings: { ...g.settings, dailyCap: undefined } };
    expect(decideAutoSendByLang(input({ gate: noCap as never }))).toMatchObject({
      outcome: 'hold',
      failedGate: 'input',
    });
    const badT = { ...g, settings: { ...g.settings, threshold: 'x' } };
    const withOverride = input({ gate: badT as never, overrides: { vi: { threshold: 0.9 } } });
    expect(decideAutoSendByLang(withOverride).failedGate).toBe('input');
    const badLevel = { ...g, levels: { channelLabel: 'bogus', post: null } };
    expect(decideAutoSendByLang(input({ gate: badLevel as never })).failedGate).toBe('input');
  });

  it('không bao giờ ném với đầu vào bất kỳ → hold', () => {
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        const r = decideAutoSendByLang(junk);
        expect(r.outcome).toBe('hold');
      }),
    );
  });

  it('gate hỏng nhưng phần ngôn ngữ đúng → hold (không ném)', () => {
    const r = decideAutoSendByLang({ ...input(), gate: { nonsense: true } });
    expect(r.outcome).toBe('hold');
  });
});

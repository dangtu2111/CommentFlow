import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { promisesImmediateReply } from '../decide/order-hours-rules';
import { RECHECK_CLOCK_SKEW_MS } from '../recheck/send-recheck';
import {
  GREETING_BLOCK_LABELS,
  GREETING_BLOCK_REASONS,
  GREETING_WINDOW_MS,
  greetingConfigSchema,
  selectGreeting,
} from './greetings';

// Fixture: giờ làm việc Thứ Hai–Sáu 08:00–17:00 giờ Việt Nam (UTC+7).
const HOURS = {
  timezone: 'Asia/Ho_Chi_Minh',
  windows: [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00' }],
};
const HOUR = 3_600_000;
const IN_HOURS = new Date('2026-11-09T02:00:00Z'); // Thứ Hai 09:00
const OUT_HOURS = new Date('2026-11-09T12:00:00Z'); // Thứ Hai 19:00
const FRI_NIGHT = new Date('2026-11-06T12:00:00Z'); // Thứ Sáu 19:00

const allOn = { greetingEnabled: true, outOfHoursEnabled: true, handoffNoticeEnabled: true };
const never = { greeting: null, outOfHours: null, handoffNotice: null };

function base(over: Record<string, unknown> = {}) {
  return {
    now: IN_HOURS,
    target: 'message',
    event: 'first_message',
    senderIsPage: false,
    conversation: {
      lastCustomerMessageAt: new Date(IN_HOURS.getTime() - 60_000),
      humanActive: false,
      lastSent: never,
    },
    lang: { detected: 'vi', channelReplyLanguage: 'auto' },
    hours: HOURS,
    config: allOn,
    ...over,
  };
}
function conv(over: Record<string, unknown>) {
  return { ...base().conversation, ...over };
}
function blocked(raw: unknown) {
  const result = selectGreeting(raw);
  if (result.send) throw new Error('mong đợi bị chặn');
  return result;
}
function sent(raw: unknown) {
  const result = selectGreeting(raw);
  if (!result.send) throw new Error(`mong đợi gửi, bị chặn: ${result.reason}`);
  return result;
}

describe('FR-074 chọn tin chào / ngoài giờ', () => {
  it('tin đầu trong giờ → tin chào tiếng Việt mặc định', () => {
    const result = sent(base());
    expect(result.kind).toBe('greeting');
    expect(result.lang).toBe('vi');
    expect(result.source).toBe('default');
    expect(result.hoursState).toBe('in_hours');
    expect(result.text).toContain('Xin chào');
  });

  it('tin đầu ngoài giờ → tin ngoài giờ nêu giờ mở cửa ngày mai', () => {
    const result = sent(
      base({ now: OUT_HOURS, conversation: conv({ lastCustomerMessageAt: OUT_HOURS }) }),
    );
    expect(result.kind).toBe('out_of_hours');
    expect(result.text).toContain('08:00 ngày mai');
  });

  it('ngoài giờ tối thứ Sáu → nêu thứ Hai (en)', () => {
    const result = sent(
      base({
        now: FRI_NIGHT,
        lang: { detected: 'en', channelReplyLanguage: 'auto' },
        conversation: conv({ lastCustomerMessageAt: FRI_NIGHT }),
      }),
    );
    expect(result.kind).toBe('out_of_hours');
    expect(result.lang).toBe('en');
    expect(result.text).toContain('08:00 on Monday');
  });

  it('chưa cấu hình giờ làm việc → không bao giờ là tin ngoài giờ (chỉ tin chào)', () => {
    const result = sent(base({ hours: undefined }));
    expect(result.kind).toBe('greeting');
    expect(result.hoursState).toBe('unknown');
  });

  it('chỉ bật tin ngoài giờ, đang trong giờ → G5 disabled', () => {
    const result = blocked(base({ config: { ...allOn, greetingEnabled: false } }));
    expect(result.rule).toBe('greeting:G5');
    expect(result.reason).toBe('disabled');
  });

  it('chỉ bật tin chào, ngoài giờ → G5 disabled (không hạ xuống tin chào)', () => {
    const result = blocked(
      base({
        now: OUT_HOURS,
        conversation: conv({ lastCustomerMessageAt: OUT_HOURS }),
        config: { ...allOn, outOfHoursEnabled: false },
      }),
    );
    expect(result.reason).toBe('disabled');
  });

  it('cấu hình rỗng → mọi loại tắt mặc định', () => {
    expect(greetingConfigSchema.parse({})).toMatchObject({
      greetingEnabled: false,
      outOfHoursEnabled: false,
      handoffNoticeEnabled: false,
      cooldownHours: 12,
      fallbackLang: 'vi',
    });
    expect(blocked(base({ config: {} })).reason).toBe('disabled');
  });
});

describe('FR-074 chọn mẫu theo ngôn ngữ', () => {
  const templates = {
    vi: { greeting: 'Chào bạn, đây là {shop_name}!' },
    en: { greeting: 'Hi, this is {shop_name}!' },
  };
  const cfg = { ...allOn, shopName: 'Hoa Lá', templates };

  it('khách nói tiếng Anh → mẫu en của shop', () => {
    const result = sent(
      base({ config: cfg, lang: { detected: 'en', channelReplyLanguage: 'auto' } }),
    );
    expect(result.text).toBe('Hi, this is Hoa Lá!');
    expect(result.source).toBe('shop');
  });

  it('kênh cố định vi thắng ngôn ngữ nhận diện', () => {
    const result = sent(
      base({ config: cfg, lang: { detected: 'en', channelReplyLanguage: 'vi' } }),
    );
    expect(result.text).toBe('Chào bạn, đây là Hoa Lá!');
  });

  it('ngôn ngữ khác → ngôn ngữ dự phòng, đánh dấu langFallback', () => {
    const result = sent(
      base({
        config: { ...cfg, fallbackLang: 'en' },
        lang: { detected: 'fr', channelReplyLanguage: 'auto' },
      }),
    );
    expect(result.lang).toBe('en');
    expect(result.langFallback).toBe(true);
    expect(result.text).toBe('Hi, this is Hoa Lá!');
  });

  it('thiếu mẫu của ngôn ngữ → mẫu mặc định cùng ngôn ngữ, không mượn ngôn ngữ khác', () => {
    const result = sent(
      base({
        config: { ...allOn, templates: { vi: { greeting: 'Chào!' } } },
        lang: { detected: 'en', channelReplyLanguage: 'auto' },
      }),
    );
    expect(result.source).toBe('default');
    expect(result.text).toContain('Hello');
  });

  it('thiếu tên shop → dùng từ chung, không để lại {shop_name}', () => {
    const result = sent(base({ config: { ...allOn, templates } }));
    expect(result.text).not.toContain('{');
    expect(result.text).toContain('shop');
  });

  it('mẫu ngoài giờ dùng {opening}; không có giờ mở cửa kế tiếp → câu thay thế', () => {
    const tpl = { vi: { outOfHours: 'Shop nghỉ rồi, mở lại {opening} nhé' } };
    const withOpening = sent(
      base({
        now: OUT_HOURS,
        conversation: conv({ lastCustomerMessageAt: OUT_HOURS }),
        config: { ...allOn, templates: tpl },
      }),
    );
    expect(withOpening.text).toBe('Shop nghỉ rồi, mở lại 08:00 ngày mai nhé');
    const noOpening = sent(
      base({
        now: OUT_HOURS,
        conversation: conv({ lastCustomerMessageAt: OUT_HOURS }),
        hours: {
          timezone: 'Asia/Ho_Chi_Minh',
          windows: [{ days: [1], from: '08:00', to: '08:00' }],
        },
        config: { ...allOn, templates: tpl },
      }),
    );
    expect(noOpening.hoursState).toBe('out_of_hours');
    expect(noOpening.text).toContain('khi shop mở cửa trở lại');
  });

  it('mẫu có biến lạ bị từ chối ở cấu hình → cả cấu hình hỏng → chặn input_unreadable', () => {
    const bad = { ...allOn, templates: { vi: { greeting: 'Chào {customer_phone}' } } };
    expect(greetingConfigSchema.safeParse(bad).success).toBe(false);
    expect(blocked(base({ config: bad })).reason).toBe('input_unreadable');
  });

  it('mẫu ngoài giờ hứa "gọi ngay" bị thay bằng mẫu mặc định', () => {
    const result = sent(
      base({
        now: OUT_HOURS,
        conversation: conv({ lastCustomerMessageAt: OUT_HOURS }),
        config: { ...allOn, templates: { vi: { outOfHours: 'Shop sẽ gọi ngay cho bạn!' } } },
      }),
    );
    expect(result.source).toBe('default_promise_blocked');
    expect(promisesImmediateReply(result.text)).toBe(false);
  });
});

describe('FR-074 báo chuyển nhân viên', () => {
  const handoff = (over: Record<string, unknown> = {}) =>
    base({ event: 'handoff', conversation: conv({ humanActive: true }), ...over });

  it('trong giờ → câu báo trong giờ', () => {
    const result = sent(handoff());
    expect(result.kind).toBe('handoff_notice');
    expect(result.text).toContain('nhân viên');
  });

  it('ngoài giờ → câu báo ngoài giờ nêu giờ mở cửa', () => {
    const result = sent(
      handoff({
        now: OUT_HOURS,
        conversation: conv({ humanActive: true, lastCustomerMessageAt: OUT_HOURS }),
      }),
    );
    expect(result.text).toContain('08:00 ngày mai');
  });

  it('trong giờ, khách nói tiếng Anh → câu báo mặc định tiếng Anh', () => {
    const result = sent(handoff({ lang: { detected: 'en', channelReplyLanguage: 'auto' } }));
    expect(result.lang).toBe('en');
    expect(result.text).toContain('team member');
  });

  it('chưa rõ giờ làm việc → dùng câu ngoài giờ (không hứa ngay)', () => {
    const result = sent(handoff({ hours: null }));
    expect(result.hoursState).toBe('unknown');
    expect(promisesImmediateReply(result.text)).toBe(false);
  });

  it('shop viết mẫu riêng cho trong/ngoài giờ', () => {
    const tpl = {
      vi: {
        handoffInHours: 'Em chuyển bạn cho nhân viên nhé',
        handoffOutHours: 'Nhân viên trả lời lúc {opening}',
      },
    };
    const config = { ...allOn, templates: tpl };
    expect(sent(handoff({ config })).text).toBe('Em chuyển bạn cho nhân viên nhé');
    expect(
      sent(
        handoff({
          config,
          now: OUT_HOURS,
          conversation: conv({ humanActive: true, lastCustomerMessageAt: OUT_HOURS }),
        }),
      ).text,
    ).toBe('Nhân viên trả lời lúc 08:00 ngày mai');
  });

  it('mẫu ngoài giờ của báo chuyển người hứa ngay → thay mặc định', () => {
    const result = sent(
      handoff({
        hours: null,
        config: { ...allOn, templates: { vi: { handoffOutHours: 'Nhân viên sẽ phản hồi ngay!' } } },
      }),
    );
    expect(result.source).toBe('default_promise_blocked');
  });

  it('nhân viên đang xử lý KHÔNG chặn câu báo chuyển người', () => {
    expect(selectGreeting(handoff()).send).toBe(true);
  });

  it('tắt báo chuyển người → G5', () => {
    expect(blocked(handoff({ config: { ...allOn, handoffNoticeEnabled: false } })).rule).toBe(
      'greeting:G5',
    );
  });
});

describe('FR-074 luật Meta: cửa sổ 24 giờ, chỉ tin nhắn', () => {
  it('đúng 24 giờ vẫn gửi; 24 giờ + 1 ms chặn G4', () => {
    const edge = new Date(IN_HOURS.getTime() - GREETING_WINDOW_MS);
    expect(selectGreeting(base({ conversation: conv({ lastCustomerMessageAt: edge }) })).send).toBe(
      true,
    );
    const late = new Date(edge.getTime() - 1);
    const result = blocked(base({ conversation: conv({ lastCustomerMessageAt: late }) }));
    expect(result.rule).toBe('greeting:G4');
    expect(result.reason).toBe('window_expired');
  });

  it('cửa sổ 7 ngày (HUMAN_AGENT) KHÔNG áp dụng cho tin tự động', () => {
    const sixDays = new Date(IN_HOURS.getTime() - 6 * 24 * HOUR);
    expect(blocked(base({ conversation: conv({ lastCustomerMessageAt: sixDays }) })).reason).toBe(
      'window_expired',
    );
  });

  it('chưa có tin nào của khách → chặn window_expired', () => {
    expect(blocked(base({ conversation: conv({ lastCustomerMessageAt: null }) })).reason).toBe(
      'window_expired',
    );
  });

  it('tin khách nằm ở tương lai quá độ lệch đồng hồ → chặn (dữ liệu sai)', () => {
    const future = new Date(IN_HOURS.getTime() + HOUR);
    expect(blocked(base({ conversation: conv({ lastCustomerMessageAt: future }) })).reason).toBe(
      'window_expired',
    );
  });

  it('có hạn gửi windowEndsAt = tin khách + 24 giờ', () => {
    const last = new Date(IN_HOURS.getTime() - HOUR);
    const result = sent(base({ conversation: conv({ lastCustomerMessageAt: last }) }));
    expect(result.windowEndsAt.getTime()).toBe(last.getTime() + GREETING_WINDOW_MS);
  });

  it('đích là bình luận → G2, không dùng nhắn riêng (chỉ có 1 tin)', () => {
    const result = blocked(base({ target: 'comment' }));
    expect(result.rule).toBe('greeting:G2');
    expect(result.reason).toBe('comment_not_supported');
  });

  it('người gửi là chính Page → G3 (chống vòng lặp)', () => {
    expect(blocked(base({ senderIsPage: true })).rule).toBe('greeting:G3');
  });
});

describe('FR-074 chống lặp và nhân viên đang xử lý', () => {
  it('nhân viên đang xử lý → không chào, không ngoài giờ (G6)', () => {
    expect(blocked(base({ conversation: conv({ humanActive: true }) })).rule).toBe('greeting:G6');
    expect(
      blocked(
        base({
          now: OUT_HOURS,
          conversation: conv({ humanActive: true, lastCustomerMessageAt: OUT_HOURS }),
        }),
      ).reason,
    ).toBe('human_active');
  });

  it('đã chào trong hội thoại → không chào lại dù lâu đến đâu (G7)', () => {
    const long = new Date(IN_HOURS.getTime() - 400 * 24 * HOUR);
    const result = blocked(
      base({ conversation: conv({ lastSent: { ...never, greeting: long } }) }),
    );
    expect(result.rule).toBe('greeting:G7');
    expect(result.reason).toBe('already_sent');
  });

  it('tin ngoài giờ: trong thời gian chờ → chặn; đúng hết thời gian chờ → gửi', () => {
    const cfg = { ...allOn, cooldownHours: 6 };
    const mk = (sentAt: Date) =>
      base({
        now: OUT_HOURS,
        config: cfg,
        conversation: conv({
          lastCustomerMessageAt: OUT_HOURS,
          lastSent: { ...never, outOfHours: sentAt },
        }),
      });
    const edge = new Date(OUT_HOURS.getTime() - 6 * HOUR);
    expect(selectGreeting(mk(edge)).send).toBe(true);
    const inside = blocked(mk(new Date(edge.getTime() + 1)));
    expect(inside.reason).toBe('cooldown');
  });

  it('báo chuyển người: trong thời gian chờ → chặn cooldown', () => {
    const result = blocked(
      base({
        event: 'handoff',
        conversation: conv({
          humanActive: true,
          lastSent: { ...never, handoffNotice: new Date(IN_HOURS.getTime() - HOUR) },
        }),
      }),
    );
    expect(result.reason).toBe('cooldown');
  });

  it('thời gian chờ không vượt 24 giờ ở cấu hình', () => {
    expect(greetingConfigSchema.safeParse({ cooldownHours: 25 }).success).toBe(false);
    expect(greetingConfigSchema.safeParse({ cooldownHours: 0 }).success).toBe(false);
  });

  it('mốc đã gửi nằm ở tương lai → coi là đang trong thời gian chờ (thiên về chặn)', () => {
    const future = new Date(IN_HOURS.getTime() + HOUR);
    const result = blocked(
      base({ conversation: conv({ lastSent: { ...never, greeting: future } }) }),
    );
    expect(result.reason).toBe('already_sent');
  });
});

describe('FR-074 đầu vào hỏng và nhãn', () => {
  it.each([
    null,
    undefined,
    42,
    'x',
    {},
    [],
    { ...base(), now: 'hôm qua' },
    { ...base(), event: 'khác' },
  ])('đầu vào hỏng %# → chặn input_unreadable, không ném', (raw) => {
    const result = blocked(raw);
    expect(result.rule).toBe('greeting:G1');
    expect(result.reason).toBe('input_unreadable');
  });

  it('thứ tự luật: G1 trước G2 trước G3 trước G4 trước G5', () => {
    const wrong = base({
      target: 'comment',
      senderIsPage: true,
      conversation: conv({ lastCustomerMessageAt: null }),
      config: {},
    });
    expect(blocked(wrong).rule).toBe('greeting:G2');
    expect(blocked({ ...wrong, target: 'message' }).rule).toBe('greeting:G3');
    expect(blocked({ ...wrong, target: 'message', senderIsPage: false }).rule).toBe('greeting:G4');
    expect(
      blocked({
        ...(wrong as object),
        target: 'message',
        senderIsPage: false,
        conversation: conv({}),
      }).rule,
    ).toBe('greeting:G5');
  });

  it('mọi mã lý do có nhãn tiếng Việt không rỗng', () => {
    for (const reason of GREETING_BLOCK_REASONS) {
      expect(GREETING_BLOCK_LABELS[reason].trim()).not.toBe('');
    }
    expect(blocked(base({ target: 'comment' })).label).toBe(
      GREETING_BLOCK_LABELS.comment_not_supported,
    );
  });
});

describe('FR-074 property-based', () => {
  const instants = fc.date({
    min: new Date('2026-01-01T00:00:00Z'),
    max: new Date('2027-01-01T00:00:00Z'),
    noInvalidDate: true,
  });
  const langs = fc.constantFrom('vi', 'en', 'fr', 'ja', '');
  const channelLangs = fc.constantFrom('auto', 'vi', 'en', 'other');
  const hoursArb = fc.option(
    fc.record({
      timezone: fc.constantFrom('Asia/Ho_Chi_Minh', 'UTC', 'America/New_York'),
      windows: fc.array(
        fc.record({
          days: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 7 }),
          from: fc.constantFrom('00:00', '06:30', '08:00', '12:00', '22:00'),
          to: fc.constantFrom('05:00', '08:00', '17:00', '23:59'),
        }),
        { maxLength: 3 },
      ),
    }),
    { nil: undefined },
  );
  const scenario = fc.record({
    now: instants,
    ageMs: fc.integer({ min: -2 * HOUR, max: 10 * 24 * HOUR }),
    event: fc.constantFrom('first_message', 'handoff'),
    target: fc.constantFrom('message', 'comment'),
    humanActive: fc.boolean(),
    detected: langs,
    channelReplyLanguage: channelLangs,
    hours: hoursArb,
  });
  type Scenario = typeof scenario extends fc.Arbitrary<infer T> ? T : never;
  const toRaw = (s: Scenario) =>
    base({
      now: s.now,
      target: s.target,
      event: s.event,
      conversation: conv({
        lastCustomerMessageAt: new Date(s.now.getTime() - s.ageMs),
        humanActive: s.humanActive,
      }),
      lang: { detected: s.detected, channelReplyLanguage: s.channelReplyLanguage },
      hours: s.hours,
    });

  it('gửi được ⇒ đích là tin nhắn và tin khách cuối ≤ 24 giờ (không âm quá lệch)', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const result = selectGreeting(toRaw(s));
        if (result.send) {
          expect(s.target).toBe('message');
          expect(s.ageMs).toBeLessThanOrEqual(GREETING_WINDOW_MS);
          expect(s.ageMs).toBeGreaterThanOrEqual(-RECHECK_CLOCK_SKEW_MS);
        }
      }),
    );
  });

  it('văn bản gửi đi không rỗng, không còn {…}, và tin ngoài giờ/báo chuyển ngoài giờ không hứa ngay', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const result = selectGreeting(toRaw(s));
        if (!result.send) return;
        expect(result.text.trim()).not.toBe('');
        expect(result.text).not.toMatch(/[{}]/);
        const outside = result.kind !== 'greeting' && result.hoursState !== 'in_hours';
        if (outside) expect(promisesImmediateReply(result.text)).toBe(false);
        if (result.kind === 'out_of_hours') expect(result.hoursState).toBe('out_of_hours');
      }),
    );
  });

  it('không bao giờ ném với đầu vào bất kỳ', () => {
    fc.assert(fc.property(fc.anything(), (raw) => selectGreeting(raw).send === false));
  });

  it('mẫu shop bất kỳ không biến lạ: văn bản ngoài giờ không bao giờ hứa ngay', () => {
    const text = fc
      .string({ minLength: 1, maxLength: 80 })
      .filter((t) => t.trim() !== '' && !/[{}]/.test(t));
    fc.assert(
      fc.property(text, (outHours) => {
        const result = selectGreeting(
          base({
            now: OUT_HOURS,
            conversation: conv({ lastCustomerMessageAt: OUT_HOURS }),
            config: { ...allOn, templates: { vi: { outOfHours: outHours } } },
          }),
        );
        if (result.send) expect(promisesImmediateReply(result.text)).toBe(false);
      }),
    );
  });
});

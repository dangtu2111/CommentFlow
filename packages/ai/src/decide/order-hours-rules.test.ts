import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideAction } from './decide-action';
import {
  detectOrderStatusIntent,
  evaluateBusinessHours,
  nextOpening,
  promisesImmediateReply,
  resolveInvitation,
  withOrderStatusTopic,
} from './order-hours-rules';

// Giờ Hà Nội = UTC+7. 2026-11-06 là thứ Sáu (day = 5).
const TZ = 'Asia/Ho_Chi_Minh';
const hanoi = (iso: string) => new Date(`${iso}+07:00`);
const MON_SAT = {
  timezone: TZ,
  windows: [{ days: [1, 2, 3, 4, 5, 6], from: '08:00', to: '17:00' }],
};

describe('FR-153 nhận ra câu hỏi đơn hàng', () => {
  it.each([
    'Đơn của em đến đâu rồi shop',
    'don hang cua minh toi dau roi',
    'sao chưa giao vậy shop',
    'Sao chua nhan duoc hang',
    'mã vận đơn của mình là gì',
    'kiểm tra đơn giúp em với',
    'đơn hàng bị trễ rồi',
    'hàng của em đến đâu rồi',
    'khi nào đơn của mình được giao',
    'Where is my order?',
    'order status please',
    'my parcel has not arrived',
    'tracking number for my order',
  ])('là hỏi đơn: %s', (text) => {
    expect(detectOrderStatusIntent(text)).toBe(true);
  });

  it.each([
    'Áo này giá bao nhiêu',
    'chốt đơn cho mình áo size M',
    'mình muốn đặt đơn 2 cái',
    'lên đơn giúp mình nhé',
    'đơn giá bao nhiêu vậy shop',
    'đơn vị ở đâu',
    'shop ở đâu vậy',
    'ship về Hà Nội bao nhiêu',
    'I want to buy this',
    '',
    '   ',
  ])('không phải hỏi đơn: %s', (text) => {
    expect(detectOrderStatusIntent(text)).toBe(false);
  });

  it('đầu vào không phải chuỗi → false, không ném', () => {
    for (const bad of [null, undefined, 42, {}, [], Number.NaN]) {
      expect(detectOrderStatusIntent(bad)).toBe(false);
    }
  });

  it('property: không ném và bất biến theo dạng Unicode', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const base = detectOrderStatusIntent(text);
        expect(detectOrderStatusIntent(text.normalize('NFD'))).toBe(base);
      }),
      { seed: 20261106 },
    );
  });
});

describe('FR-153 withOrderStatusTopic', () => {
  it('hỏi đơn → thêm order_status chưa nguồn, giữ chủ đề khác', () => {
    const out = withOrderStatusTopic([{ topic: 'shipping', sourced: true }], 'đơn đến đâu rồi');
    expect(out).toEqual([
      { topic: 'shipping', sourced: true },
      { topic: 'order_status', sourced: false },
    ]);
  });

  it('ép order_status đã có thành chưa nguồn, không nhân đôi', () => {
    const out = withOrderStatusTopic(
      [
        { topic: 'order_status', sourced: true },
        { topic: 'size', sourced: true },
      ],
      'sao chưa giao',
    );
    expect(out).toEqual([
      { topic: 'size', sourced: true },
      { topic: 'order_status', sourced: false },
    ]);
  });

  it('không phải hỏi đơn → giữ nguyên', () => {
    const topics = [{ topic: 'size' as const, sourced: true }];
    expect(withOrderStatusTopic(topics, 'áo này giá bao nhiêu')).toEqual(topics);
  });

  it('FR-153 decideAction: redirect + chuyển người + kb_gaps order_status', () => {
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
      products: { candidates: [], missingAxes: [] },
      topics: withOrderStatusTopic([], 'sao chưa giao vậy shop'),
      thread: { clarifyCount: 0, repeatCount: 0 },
      risks: {
        priceConflict: false,
        legalUnsourced: false,
        impersonation: false,
        stockStale: false,
        injectionSuspected: false,
      },
    });
    expect(decision).toMatchObject({
      action: 'redirect',
      reason: 'order_status',
      needsHuman: true,
      needsSupportTag: true,
      autoSendPolicy: 'never',
      redirectTemplates: ['order_status'],
    });
    expect(decision.unansweredTopics).toContain('order_status');
  });
});

describe('FR-152 giờ làm việc', () => {
  it('trong giờ / ngoài giờ theo múi giờ workspace', () => {
    const inside = evaluateBusinessHours({ now: hanoi('2026-11-06T10:00:00'), hours: MON_SAT });
    expect(inside.state).toBe('in_hours');
    expect(inside.nextOpening).toBeNull();
    const evening = evaluateBusinessHours({ now: hanoi('2026-11-06T20:00:00'), hours: MON_SAT });
    expect(evening.state).toBe('out_of_hours');
    expect(evening.nextOpening).toEqual({ daysAhead: 1, day: 6, time: '08:00' });
  });

  it('múi giờ khác nhau cho kết quả khác nhau cùng một thời điểm', () => {
    const now = new Date('2026-11-06T03:00:00Z'); // 10:00 Hà Nội, 04:00 sáng Berlin... (UTC+1)
    expect(evaluateBusinessHours({ now, hours: MON_SAT }).state).toBe('in_hours');
    expect(
      evaluateBusinessHours({ now, hours: { ...MON_SAT, timezone: 'Europe/Berlin' } }).state,
    ).toBe('out_of_hours');
  });

  it('biên: đúng giờ mở là trong giờ, đúng giờ đóng là ngoài giờ', () => {
    expect(evaluateBusinessHours({ now: hanoi('2026-11-06T08:00:00'), hours: MON_SAT }).state).toBe(
      'in_hours',
    );
    expect(evaluateBusinessHours({ now: hanoi('2026-11-06T07:59:00'), hours: MON_SAT }).state).toBe(
      'out_of_hours',
    );
    expect(evaluateBusinessHours({ now: hanoi('2026-11-06T17:00:00'), hours: MON_SAT }).state).toBe(
      'out_of_hours',
    );
  });

  it('nextOpening: sáng sớm cùng ngày, Chủ nhật → thứ Hai, tuần sau khi chỉ một ngày', () => {
    expect(nextOpening(hanoi('2026-11-06T06:00:00'), MON_SAT)).toEqual({
      daysAhead: 0,
      day: 5,
      time: '08:00',
    });
    // 2026-11-07 thứ Bảy 18:00 → Chủ nhật nghỉ → thứ Hai 09/11
    expect(nextOpening(hanoi('2026-11-07T18:00:00'), MON_SAT)).toEqual({
      daysAhead: 2,
      day: 1,
      time: '08:00',
    });
    const onlyFriday = { timezone: TZ, windows: [{ days: [5], from: '08:00', to: '17:00' }] };
    expect(nextOpening(hanoi('2026-11-06T18:00:00'), onlyFriday)).toEqual({
      daysAhead: 7,
      day: 5,
      time: '08:00',
    });
  });

  it('nextOpening: chọn khung sớm nhất trong nhiều khung; bỏ khung rỗng from = to', () => {
    const hours = {
      timezone: TZ,
      windows: [
        { days: [5], from: '13:00', to: '17:00' },
        { days: [5], from: '09:00', to: '11:00' },
        { days: [5], from: '12:00', to: '12:00' },
      ],
    };
    expect(nextOpening(hanoi('2026-11-06T08:00:00'), hours)).toEqual({
      daysAhead: 0,
      day: 5,
      time: '09:00',
    });
    expect(nextOpening(hanoi('2026-11-06T11:30:00'), hours)).toEqual({
      daysAhead: 0,
      day: 5,
      time: '13:00',
    });
  });

  it('khung qua đêm: sau nửa đêm vẫn trong giờ', () => {
    const night = { timezone: TZ, windows: [{ days: [5], from: '20:00', to: '02:00' }] };
    expect(evaluateBusinessHours({ now: hanoi('2026-11-06T21:00:00'), hours: night }).state).toBe(
      'in_hours',
    );
    expect(evaluateBusinessHours({ now: hanoi('2026-11-07T01:00:00'), hours: night }).state).toBe(
      'in_hours',
    );
    expect(evaluateBusinessHours({ now: hanoi('2026-11-07T03:00:00'), hours: night }).state).toBe(
      'out_of_hours',
    );
  });

  it('chưa cấu hình / rỗng / hỏng / giờ hỏng → unknown, không ném', () => {
    const now = hanoi('2026-11-06T10:00:00');
    const unknown = { state: 'unknown', nextOpening: null };
    expect(evaluateBusinessHours({ now, hours: null })).toEqual(unknown);
    expect(evaluateBusinessHours({ now, hours: undefined })).toEqual(unknown);
    expect(evaluateBusinessHours({ now, hours: { timezone: TZ, windows: [] } })).toEqual(unknown);
    expect(evaluateBusinessHours({ now, hours: { timezone: 'Mars/Base', windows: [] } })).toEqual(
      unknown,
    );
    expect(evaluateBusinessHours({ now, hours: 'abc' })).toEqual(unknown);
    expect(evaluateBusinessHours({ now: new Date('x'), hours: MON_SAT })).toEqual(unknown);
    expect(evaluateBusinessHours({ now: 'x' as unknown as Date, hours: MON_SAT })).toEqual(unknown);
    expect(nextOpening(new Date('x'), MON_SAT)).toBeNull();
    expect(nextOpening(now, null)).toBeNull();
  });

  it('khung toàn from = to (không bao giờ mở) → nextOpening null', () => {
    const never = { timezone: TZ, windows: [{ days: [5], from: '08:00', to: '08:00' }] };
    const out = evaluateBusinessHours({ now: hanoi('2026-11-06T10:00:00'), hours: never });
    expect(out).toEqual({ state: 'out_of_hours', nextOpening: null });
  });
});

describe('FR-152 phát hiện lời hứa phản hồi ngay', () => {
  it.each([
    'Shop sẽ gọi ngay cho bạn',
    'nhân viên gọi lại ngay',
    'Liên hệ ngay với bạn nhé',
    'sẽ phản hồi ngay lập tức',
    'trả lời ngay',
    'hỗ trợ ngay',
    'trong 5 phút nữa shop nhắn lại',
    'trong vài phút shop báo',
    'We will call you right now',
    'We will get back to you immediately',
    'reply right away',
    'Shop sẽ GỌI NGAY!',
  ])('hứa ngay: %s', (text) => {
    expect(promisesImmediateReply(text)).toBe(true);
  });

  it.each([
    'Shop sẽ phản hồi từ 08:00 ngày mai',
    'nhân viên sẽ nhắn bạn khi shop mở cửa',
    'Shop ở ngay trung tâm thành phố',
    'gọi ngày mai nhé',
    'We reply from 8am tomorrow',
    '',
  ])('không hứa ngay: %s', (text) => {
    expect(promisesImmediateReply(text)).toBe(false);
  });
});

describe('FR-152 resolveInvitation', () => {
  const IN = hanoi('2026-11-06T10:00:00');
  const OUT = hanoi('2026-11-06T20:00:00');
  const templates = {
    shipping: {
      inHours: 'Ship: nhân viên nhắn bạn ngay.',
      outHours: 'Ship: shop nhắn từ sáng mai.',
    },
    order_status: {
      inHours: 'Đơn: shop kiểm tra rồi báo.',
      outHours: 'Đơn: shop sẽ gọi ngay cho bạn.',
    },
  };
  const redirect = (keys: string[]) => ({ action: 'redirect', redirectTemplates: keys });

  it('answer / clarify → null (không cần câu mời)', () => {
    for (const action of ['answer', 'clarify']) {
      expect(
        resolveInvitation({
          decision: { action, redirectTemplates: [] },
          lang: 'vi',
          templates,
          hours: MON_SAT,
          now: IN,
        }),
      ).toBeNull();
    }
  });

  it('trong giờ → mẫu inHours của shop (giữ nguyên, kể cả "ngay")', () => {
    const out = resolveInvitation({
      decision: redirect(['shipping']),
      lang: 'vi',
      templates,
      hours: MON_SAT,
      now: IN,
    });
    expect(out).toEqual({
      variant: 'inHours',
      hoursState: 'in_hours',
      items: [{ key: 'shipping', text: 'Ship: nhân viên nhắn bạn ngay.', source: 'shop' }],
    });
  });

  it('ngoài giờ → mẫu outHours của shop', () => {
    const out = resolveInvitation({
      decision: redirect(['shipping']),
      lang: 'vi',
      templates,
      hours: MON_SAT,
      now: OUT,
    });
    expect(out?.variant).toBe('outHours');
    expect(out?.items).toEqual([
      { key: 'shipping', text: 'Ship: shop nhắn từ sáng mai.', source: 'shop' },
    ]);
  });

  it('ngoài giờ mà mẫu hứa "gọi ngay" → thay bằng câu mặc định, không hứa', () => {
    const out = resolveInvitation({
      decision: redirect(['order_status']),
      lang: 'vi',
      templates,
      hours: MON_SAT,
      now: OUT,
    });
    const [item] = out?.items ?? [];
    expect(item?.source).toBe('default_promise_blocked');
    expect(item?.text).toContain('08:00 ngày mai');
    expect(promisesImmediateReply(item?.text ?? '')).toBe(false);
  });

  it('thiếu mẫu shop → mặc định theo ngôn ngữ; nhiều khóa giữ thứ tự', () => {
    const vi = resolveInvitation({
      decision: redirect(['discount', 'stock_check']),
      lang: 'vi',
      templates: {},
      hours: MON_SAT,
      now: IN,
    });
    expect(vi?.items.map((i) => [i.key, i.source])).toEqual([
      ['discount', 'default'],
      ['stock_check', 'default'],
    ]);
    const en = resolveInvitation({
      decision: redirect(['shipping']),
      lang: 'en',
      templates: null,
      hours: MON_SAT,
      now: IN,
    });
    expect(en?.items[0]?.text).toMatch(/shipping/i);
  });

  it('mặc định ngoài giờ nêu giờ mở cửa kế tiếp: hôm nay / ngày mai / thứ (vi, en)', () => {
    const text = (lang: 'vi' | 'en', now: Date) =>
      resolveInvitation({
        decision: redirect(['other']),
        lang,
        templates: null,
        hours: MON_SAT,
        now,
      })?.items[0]?.text;
    expect(text('vi', hanoi('2026-11-06T06:00:00'))).toContain('08:00 hôm nay');
    expect(text('vi', OUT)).toContain('08:00 ngày mai');
    expect(text('vi', hanoi('2026-11-07T18:00:00'))).toContain('08:00 thứ Hai');
    expect(text('en', hanoi('2026-11-06T06:00:00'))).toContain('08:00 today');
    expect(text('en', OUT)).toContain('08:00 tomorrow');
    expect(text('en', hanoi('2026-11-07T18:00:00'))).toContain('08:00 on Monday');
  });

  it('chưa rõ giờ làm việc → dùng câu ngoài giờ an toàn, không nêu giờ', () => {
    const out = resolveInvitation({
      decision: redirect(['other']),
      lang: 'vi',
      templates: { other: { inHours: 'Gọi ngay!', outHours: 'Shop nhắn khi mở cửa.' } },
      hours: null,
      now: IN,
    });
    expect(out).toMatchObject({ variant: 'outHours', hoursState: 'unknown' });
    expect(out?.items[0]?.text).toBe('Shop nhắn khi mở cửa.');
    const fallback = resolveInvitation({
      decision: redirect(['other']),
      lang: 'vi',
      templates: null,
      hours: null,
      now: IN,
    });
    expect(fallback?.items[0]?.text).toContain('khi shop mở cửa');
  });

  it('ngoài giờ nhưng không có giờ mở kế tiếp (khung rỗng) → câu chung', () => {
    const never = { timezone: TZ, windows: [{ days: [5], from: '08:00', to: '08:00' }] };
    const out = resolveInvitation({
      decision: redirect(['other']),
      lang: 'en',
      templates: null,
      hours: never,
      now: IN,
    });
    expect(out?.items[0]?.text).toMatch(/opens again/);
  });

  it('handoff / redirect không khóa → dùng khóa other', () => {
    const t = { other: { inHours: 'IN', outHours: 'OUT' } };
    const handoff = resolveInvitation({
      decision: { action: 'handoff', redirectTemplates: [] },
      lang: 'vi',
      templates: t,
      hours: MON_SAT,
      now: IN,
    });
    expect(handoff?.items).toEqual([{ key: 'other', text: 'IN', source: 'shop' }]);
    const bare = resolveInvitation({
      decision: redirect([]),
      lang: 'vi',
      templates: t,
      hours: MON_SAT,
      now: OUT,
    });
    expect(bare?.items).toEqual([{ key: 'other', text: 'OUT', source: 'shop' }]);
  });

  it('mẫu rỗng/sai kiểu → mặc định; khóa lạ bị bỏ; lang other dùng tiếng Anh', () => {
    const out = resolveInvitation({
      decision: redirect(['shipping', 'bogus']),
      lang: 'other',
      templates: { shipping: { inHours: '  ', outHours: 5 } } as never,
      hours: MON_SAT,
      now: IN,
    });
    expect(out?.items).toHaveLength(1);
    expect(out?.items[0]).toMatchObject({ key: 'shipping', source: 'default' });
    expect(out?.items[0]?.text).toMatch(/shipping/i);
  });

  it('đầu vào hỏng → null, không ném', () => {
    for (const bad of [null, undefined, 'x', 3, {}, { decision: null }]) {
      expect(resolveInvitation(bad)).toBeNull();
    }
  });

  it('property: ngoài giờ/chưa rõ giờ không bao giờ có câu hứa ngay', () => {
    const phrase = fc.constantFrom(
      'gọi ngay',
      'phản hồi ngay lập tức',
      'trong vài phút',
      'call you right now',
      'liên hệ ngay',
      'ok',
      'nhắn bạn từ sáng mai',
    );
    fc.assert(
      fc.property(
        phrase,
        phrase,
        fc.constantFrom<unknown>(null, MON_SAT),
        fc.date({ min: new Date('2026-01-01'), max: new Date('2027-01-01'), noInvalidDate: true }),
        fc.constantFrom('vi', 'en'),
        (inText, outText, hours, now, lang) => {
          const out = resolveInvitation({
            decision: redirect(['shipping', 'order_status', 'other']),
            lang,
            templates: {
              shipping: { inHours: inText, outHours: outText },
              order_status: { inHours: inText, outHours: outText },
            },
            hours,
            now,
          });
          if (out === null || out.variant === 'inHours') return;
          for (const item of out.items) expect(promisesImmediateReply(item.text)).toBe(false);
        },
      ),
      { seed: 20261106 },
    );
  });
});

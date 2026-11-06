import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AUTO_MESSAGE_WINDOW_MS,
  HUMAN_AGENT_WINDOW_MS,
  RECHECK_ACTIONS,
  RECHECK_CLOCK_SKEW_MS,
  RECHECK_COUNT,
  RECHECK_LABELS,
  RECHECK_REASONS,
  RECHECK_SENDABLE_STATUSES,
  readSendRecheckInput,
  type SendRecheckInput,
  type SendRecheckResult,
  sendRecheck,
} from './send-recheck';

const NOW = '2026-11-06T03:00:00.000Z';
const T0 = '2026-11-01T00:00:00.000Z';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const price = (over: Partial<{ productId: string; priceVnd: number; at: string | null }> = {}) => ({
  productId: over.productId ?? 'p1',
  priceVnd: over.priceVnd ?? 199_000,
  updatedFromSourceAt: over.at === undefined ? T0 : over.at,
});

/** Ca mốc người gửi (nhân viên bấm Gửi): qua đủ R1–R9. */
function human(over: Partial<SendRecheckInput> = {}): SendRecheckInput {
  return {
    mode: 'human',
    target: 'comment',
    now: NOW,
    comment: {
      status: 'sending',
      externalReplyId: null,
      isHidden: false,
      mergedIntoId: null,
      deletedAt: null,
    },
    channel: { status: 'connected', sendSuspended: false },
    automation: null,
    price: null,
    kb: null,
    quota: null,
    message: null,
    rate: null,
    ...over,
  };
}

/** Ca mốc tự gửi: đủ dữ liệu R4–R7 và R9, qua hết. */
function auto(over: Partial<SendRecheckInput> = {}): SendRecheckInput {
  return human({
    mode: 'auto',
    comment: {
      status: 'scheduled_auto',
      externalReplyId: null,
      isHidden: false,
      mergedIntoId: null,
      deletedAt: null,
    },
    automation: { aiEnabled: true, emergencyStopped: false, aiPaused: false, level: 'auto' },
    price: { hasMoney: true, snapshot: [price()], current: [price()] },
    kb: { draftVersion: 'v7', currentVersion: 'v7', changeAffectsDraft: false },
    quota: {
      turnsRemaining: 10,
      aiCostCapUsd: 50,
      aiCostMonthUsd: 10,
      dailyCap: 100,
      autoSentToday: 3,
    },
    rate: { remaining: 5 },
    ...over,
  });
}

const PASS: SendRecheckResult = {
  ok: true,
  rule: null,
  reason: null,
  action: null,
  rulesPassed: RECHECK_COUNT,
};

function expectFail(input: SendRecheckInput, n: number, reason: string, action: string) {
  const r = sendRecheck(input);
  expect(r.ok).toBe(false);
  expect(r.rule).toBe(`recheck:R${n}`);
  expect(r.reason).toBe(reason);
  expect(r.action).toBe(action);
  expect(r.rulesPassed).toBe(n - 1);
}

describe('FR-110 sendRecheck — qua đủ R1–R9', () => {
  it('người gửi, dữ liệu sạch → ok (R4/R6/R7 không áp dụng, R5/R8/R9 không có dữ liệu để kiểm)', () => {
    expect(sendRecheck(human())).toEqual(PASS);
  });

  it('tự gửi, đủ dữ liệu, mọi điều kiện đúng → ok', () => {
    expect(sendRecheck(auto())).toEqual(PASS);
  });

  it('trạng thái gửi được: người gửi chỉ sending, tự gửi scheduled_auto/sending; có 9 nhãn hiển thị; không có hành động "ẩn"', () => {
    expect(RECHECK_SENDABLE_STATUSES.human).toEqual(['sending']);
    expect([...RECHECK_SENDABLE_STATUSES.auto].sort()).toEqual(['scheduled_auto', 'sending']);
    expect(
      Object.keys(RECHECK_LABELS)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(RECHECK_ACTIONS).not.toContain('hide');
    expect(new Set(RECHECK_REASONS).size).toBe(RECHECK_REASONS.length);
  });
});

describe('FR-110 R1 — chưa được trả lời, trạng thái vẫn gửi được → hủy', () => {
  it('đã có external_reply_id → recheck:R1 already_replied, hủy', () => {
    expectFail(
      human({ comment: { ...human().comment, externalReplyId: 'r-1' } }),
      1,
      'already_replied',
      'cancel',
    );
  });

  it('trạng thái không còn sending/scheduled_auto (người khác đổi) → recheck:R1 status_changed', () => {
    for (const status of ['replied', 'pending_review', 'skipped', 'new', 'send_failed']) {
      expectFail(human({ comment: { ...human().comment, status } }), 1, 'status_changed', 'cancel');
    }
  });

  it('người gửi KHÔNG được gửi đè câu AI đã lên lịch (scheduled_auto → R1); tự gửi nhận cả scheduled_auto lẫn sending', () => {
    expectFail(
      human({ comment: { ...human().comment, status: 'scheduled_auto' } }),
      1,
      'status_changed',
      'cancel',
    );
    expect(sendRecheck(auto({ comment: { ...auto().comment, status: 'sending' } })).ok).toBe(true);
    expect(sendRecheck(auto({ comment: { ...auto().comment, status: 'scheduled_auto' } })).ok).toBe(
      true,
    );
  });
});

describe('FR-110 R2 — chưa bị xóa/ẩn/gộp trên nền tảng → hủy', () => {
  it('khách đã xóa (deleted_at) → recheck:R2 comment_deleted', () => {
    expectFail(
      human({ comment: { ...human().comment, deletedAt: T0 } }),
      2,
      'comment_deleted',
      'cancel',
    );
  });
  it('đã ẩn → recheck:R2 comment_hidden', () => {
    expectFail(
      human({ comment: { ...human().comment, isHidden: true } }),
      2,
      'comment_hidden',
      'cancel',
    );
  });
  it('đã gộp vào bình luận khác → recheck:R2 comment_merged', () => {
    expectFail(
      human({ comment: { ...human().comment, mergedIntoId: 'c-2' } }),
      2,
      'comment_merged',
      'cancel',
    );
  });
});

describe('FR-110 R3 — kênh còn connected, không bị tạm khóa gửi → giữ lại, báo lỗi kênh', () => {
  it('kênh expired/revoked/error/disconnected → recheck:R3 channel_disconnected', () => {
    for (const status of ['expired', 'revoked', 'error', 'disconnected']) {
      expectFail(
        human({ channel: { status, sendSuspended: false } }),
        3,
        'channel_disconnected',
        'channel_error',
      );
    }
  });
  it('kênh connected nhưng đang bị tạm khóa gửi (§11) → recheck:R3 channel_send_suspended', () => {
    expectFail(
      human({ channel: { status: 'connected', sendSuspended: true } }),
      3,
      'channel_send_suspended',
      'channel_error',
    );
  });
});

describe('FR-110 R4 — chỉ tự gửi: workspace chưa Dừng khẩn cấp, AI chưa tự tạm dừng, mức vẫn auto → Chờ duyệt', () => {
  const a = auto().automation!;
  it('tự gửi mà không đọc được cài đặt tự động (null) → trượt automation_unknown (thiên về chặn)', () => {
    expectFail(auto({ automation: null }), 4, 'automation_unknown', 'hold_review');
  });
  it('công tắc AI tắt → workspace_ai_off', () => {
    expectFail(
      auto({ automation: { ...a, aiEnabled: false } }),
      4,
      'workspace_ai_off',
      'hold_review',
    );
  });
  it('Dừng khẩn cấp → emergency_stopped', () => {
    expectFail(
      auto({ automation: { ...a, emergencyStopped: true } }),
      4,
      'emergency_stopped',
      'hold_review',
    );
  });
  it('AI tự tạm dừng → ai_paused', () => {
    expectFail(auto({ automation: { ...a, aiPaused: true } }), 4, 'ai_paused', 'hold_review');
  });
  it('mức kênh × nhãn không còn auto (off/shadow) → mode_not_auto', () => {
    expectFail(auto({ automation: { ...a, level: 'off' } }), 4, 'mode_not_auto', 'hold_review');
    expectFail(auto({ automation: { ...a, level: 'shadow' } }), 4, 'mode_not_auto', 'hold_review');
  });
  it('người gửi: R4 không áp dụng dù cài đặt tự động đang tắt/dừng khẩn cấp', () => {
    expect(
      sendRecheck(
        human({
          automation: { aiEnabled: false, emergencyStopped: true, aiPaused: true, level: 'off' },
        }),
      ),
    ).toEqual(PASS);
  });
});

describe('FR-110 R5 — câu có số tiền: giá/tồn còn khớp ảnh chụp', () => {
  it('giá đổi → tự gửi về Chờ duyệt price_changed; người gửi → hỏi xác nhận', () => {
    const changed = {
      hasMoney: true,
      snapshot: [price()],
      current: [price({ priceVnd: 189_000 })],
    };
    expectFail(auto({ price: changed }), 5, 'price_changed', 'hold_review');
    expectFail(human({ price: changed }), 5, 'price_changed', 'ask_confirm');
  });
  it('updated_from_source_at đổi (đồng bộ lại từ nguồn) dù giá không đổi → price_changed', () => {
    expectFail(
      auto({ price: { hasMoney: true, snapshot: [price()], current: [price({ at: NOW })] } }),
      5,
      'price_changed',
      'hold_review',
    );
    expectFail(
      auto({ price: { hasMoney: true, snapshot: [price({ at: null })], current: [price()] } }),
      5,
      'price_changed',
      'hold_review',
    );
    expectFail(
      auto({ price: { hasMoney: true, snapshot: [price()], current: [price({ at: null })] } }),
      5,
      'price_changed',
      'hold_review',
    );
  });
  it('sản phẩm trong ảnh chụp không còn (xóa/lưu trữ) → price_changed', () => {
    expectFail(
      auto({
        price: { hasMoney: true, snapshot: [price()], current: [price({ productId: 'p2' })] },
      }),
      5,
      'price_changed',
      'hold_review',
    );
    expectFail(
      auto({ price: { hasMoney: true, snapshot: [price()], current: [] } }),
      5,
      'price_changed',
      'hold_review',
    );
  });
  it('câu có số tiền nhưng ảnh chụp rỗng (không kiểm được) → price_snapshot_missing', () => {
    expectFail(
      auto({ price: { hasMoney: true, snapshot: [], current: [price()] } }),
      5,
      'price_snapshot_missing',
      'hold_review',
    );
  });
  it('nhiều sản phẩm: chỉ một cái lệch cũng trượt; đủ khớp thì qua; thêm sản phẩm mới ngoài ảnh chụp không sao', () => {
    const snap = [price(), price({ productId: 'p2', priceVnd: 99_000 })];
    expectFail(
      auto({
        price: {
          hasMoney: true,
          snapshot: snap,
          current: [price(), price({ productId: 'p2', priceVnd: 98_000 })],
        },
      }),
      5,
      'price_changed',
      'hold_review',
    );
    expect(
      sendRecheck(
        auto({
          price: { hasMoney: true, snapshot: snap, current: [...snap, price({ productId: 'p3' })] },
        }),
      ).ok,
    ).toBe(true);
  });
  it('câu không có số tiền (hasMoney=false do code dò) → R5 không áp dụng dù ảnh chụp lệch', () => {
    expect(
      sendRecheck(
        auto({
          price: { hasMoney: false, snapshot: [price()], current: [price({ priceVnd: 1 })] },
        }),
      ).ok,
    ).toBe(true);
    expect(sendRecheck(auto({ price: { hasMoney: false, snapshot: [], current: [] } })).ok).toBe(
      true,
    );
  });
  it('tự gửi mà nơi gọi chưa xác định câu có tiền hay không (price null) → trượt price_unknown; người gửi (chưa có bản nháp) → qua', () => {
    expectFail(auto({ price: null }), 5, 'price_unknown', 'hold_review');
    expect(sendRecheck(human({ price: null })).ok).toBe(true);
  });
});

describe('FR-110 R6 — chỉ tự gửi: kb_version còn khớp hoặc thay đổi không ảnh hưởng → Chờ duyệt', () => {
  it('không đọc được phiên bản KB (null) → kb_unknown', () => {
    expectFail(auto({ kb: null }), 6, 'kb_unknown', 'hold_review');
  });
  it('phiên bản khác và thay đổi thuộc danh mục ảnh hưởng → kb_changed', () => {
    expectFail(
      auto({ kb: { draftVersion: 'v7', currentVersion: 'v8', changeAffectsDraft: true } }),
      6,
      'kb_changed',
      'hold_review',
    );
  });
  it('phiên bản khác nhưng thay đổi không ảnh hưởng → qua; cùng phiên bản → qua dù cờ ảnh hưởng bật', () => {
    expect(
      sendRecheck(
        auto({ kb: { draftVersion: 'v7', currentVersion: 'v8', changeAffectsDraft: false } }),
      ).ok,
    ).toBe(true);
    expect(
      sendRecheck(
        auto({ kb: { draftVersion: 'v7', currentVersion: 'v7', changeAffectsDraft: true } }),
      ).ok,
    ).toBe(true);
  });
  it('người gửi: R6 không áp dụng', () => {
    expect(
      sendRecheck(
        human({ kb: { draftVersion: 'v1', currentVersion: 'v9', changeAffectsDraft: true } }),
      ).ok,
    ).toBe(true);
  });
});

describe('FR-110 R7 — chỉ tự gửi: còn lượt, chưa vượt trần chi phí, chưa vượt giới hạn/ngày → Chờ duyệt', () => {
  const q = auto().quota!;
  it('không đọc được hạn mức (null) → quota_unknown', () => {
    expectFail(auto({ quota: null }), 7, 'quota_unknown', 'hold_review');
  });
  it('hết lượt (0) → quota_exhausted; còn 1 lượt → qua; null = không giới hạn lượt', () => {
    expectFail(auto({ quota: { ...q, turnsRemaining: 0 } }), 7, 'quota_exhausted', 'hold_review');
    expect(sendRecheck(auto({ quota: { ...q, turnsRemaining: 1 } })).ok).toBe(true);
    expect(sendRecheck(auto({ quota: { ...q, turnsRemaining: null } })).ok).toBe(true);
  });
  it('chi phí tháng ≥ trần → cost_cap_reached (đúng ngưỡng cũng chặn); null = không trần', () => {
    expectFail(
      auto({ quota: { ...q, aiCostCapUsd: 10, aiCostMonthUsd: 10 } }),
      7,
      'cost_cap_reached',
      'hold_review',
    );
    expect(sendRecheck(auto({ quota: { ...q, aiCostCapUsd: 10, aiCostMonthUsd: 9.99 } })).ok).toBe(
      true,
    );
    expect(sendRecheck(auto({ quota: { ...q, aiCostCapUsd: null, aiCostMonthUsd: 999 } })).ok).toBe(
      true,
    );
  });
  it('đã gửi ≥ giới hạn/ngày → daily_cap_reached (đúng ngưỡng cũng chặn); null = không giới hạn', () => {
    expectFail(
      auto({ quota: { ...q, dailyCap: 3, autoSentToday: 3 } }),
      7,
      'daily_cap_reached',
      'hold_review',
    );
    expect(sendRecheck(auto({ quota: { ...q, dailyCap: 3, autoSentToday: 2 } })).ok).toBe(true);
    expect(sendRecheck(auto({ quota: { ...q, dailyCap: null, autoSentToday: 10_000 } })).ok).toBe(
      true,
    );
  });
  it('thứ tự trong R7: hết lượt báo trước trần chi phí, trần chi phí trước giới hạn/ngày', () => {
    expectFail(
      auto({
        quota: {
          turnsRemaining: 0,
          aiCostCapUsd: 1,
          aiCostMonthUsd: 5,
          dailyCap: 1,
          autoSentToday: 5,
        },
      }),
      7,
      'quota_exhausted',
      'hold_review',
    );
    expectFail(
      auto({
        quota: {
          turnsRemaining: 5,
          aiCostCapUsd: 1,
          aiCostMonthUsd: 5,
          dailyCap: 1,
          autoSentToday: 5,
        },
      }),
      7,
      'cost_cap_reached',
      'hold_review',
    );
  });
  it('người gửi: R7 không áp dụng', () => {
    expect(
      sendRecheck(
        human({
          quota: {
            turnsRemaining: 0,
            aiCostCapUsd: 1,
            aiCostMonthUsd: 5,
            dailyCap: 1,
            autoSentToday: 5,
          },
        }),
      ).ok,
    ).toBe(true);
  });
});

describe('FR-110 R8 — tin nhắn: còn trong cửa sổ tính tại thời điểm gửi', () => {
  const at = (msAgo: number) => new Date(Date.parse(NOW) - msAgo).toISOString();
  it('tự gửi: 24 giờ — 23h59 qua, đúng 24 giờ chặn', () => {
    expect(
      sendRecheck(
        auto({
          target: 'message',
          message: { lastInboundAt: at(AUTO_MESSAGE_WINDOW_MS - 60_000), humanAgent: false },
        }),
      ).ok,
    ).toBe(true);
    expectFail(
      auto({
        target: 'message',
        message: { lastInboundAt: at(AUTO_MESSAGE_WINDOW_MS), humanAgent: false },
      }),
      8,
      'message_window_closed',
      'hold_review',
    );
  });
  it('người gửi không có HUMAN_AGENT: 24 giờ; có HUMAN_AGENT: 7 ngày (đúng 7 ngày chặn)', () => {
    const twoDays = at(2 * DAY_MS);
    expectFail(
      human({ target: 'message', message: { lastInboundAt: twoDays, humanAgent: false } }),
      8,
      'message_window_closed',
      'hold_review',
    );
    expect(
      sendRecheck(
        human({ target: 'message', message: { lastInboundAt: twoDays, humanAgent: true } }),
      ).ok,
    ).toBe(true);
    expectFail(
      human({
        target: 'message',
        message: { lastInboundAt: at(HUMAN_AGENT_WINDOW_MS), humanAgent: true },
      }),
      8,
      'message_window_closed',
      'hold_review',
    );
    expect(
      sendRecheck(
        human({
          target: 'message',
          message: { lastInboundAt: at(HUMAN_AGENT_WINDOW_MS - 1), humanAgent: true },
        }),
      ).ok,
    ).toBe(true);
  });
  it('tự gửi với HUMAN_AGENT vẫn chỉ 24 giờ (thẻ 7 ngày dành cho người)', () => {
    expectFail(
      auto({ target: 'message', message: { lastInboundAt: at(25 * HOUR_MS), humanAgent: true } }),
      8,
      'message_window_closed',
      'hold_review',
    );
  });
  it('tin nhắn thiếu mốc tin cuối (null) → chặn; mốc ở tương lai quá độ lệch đồng hồ → chặn; lệch nhỏ → qua', () => {
    expectFail(
      auto({ target: 'message', message: null }),
      8,
      'message_window_closed',
      'hold_review',
    );
    expectFail(
      auto({
        target: 'message',
        message: { lastInboundAt: at(-(RECHECK_CLOCK_SKEW_MS + 1)), humanAgent: false },
      }),
      8,
      'message_window_closed',
      'hold_review',
    );
    expect(
      sendRecheck(
        auto({
          target: 'message',
          message: { lastInboundAt: at(-RECHECK_CLOCK_SKEW_MS), humanAgent: false },
        }),
      ).ok,
    ).toBe(true);
  });
  it('bình luận: R8 không áp dụng dù message đã đóng', () => {
    expect(
      sendRecheck(
        human({
          target: 'comment',
          message: { lastInboundAt: at(30 * DAY_MS), humanAgent: false },
        }),
      ).ok,
    ).toBe(true);
  });
});

describe('FR-110 R9 — còn hạn mức tốc độ gửi theo Page → hoãn job (không phải lỗi)', () => {
  it('còn 0 lượt → recheck:R9 rate_limited, hoãn; còn 1 → qua', () => {
    expectFail(human({ rate: { remaining: 0 } }), 9, 'rate_limited', 'defer');
    expect(sendRecheck(human({ rate: { remaining: 1 } })).ok).toBe(true);
  });
  it('chưa có bộ giới hạn (null, gap SEND-RATE-LIMIT) → qua ở cả hai chế độ', () => {
    expect(sendRecheck(human({ rate: null })).ok).toBe(true);
    expect(sendRecheck(auto({ rate: null })).ok).toBe(true);
  });
});

describe('FR-110 thứ tự và đầu vào hỏng', () => {
  it('nhiều điều kiện cùng trượt → báo điều kiện nhỏ nhất', () => {
    expectFail(
      auto({
        comment: { ...auto().comment, externalReplyId: 'x', isHidden: true },
        channel: { status: 'expired', sendSuspended: true },
        automation: null,
        rate: { remaining: 0 },
      }),
      1,
      'already_replied',
      'cancel',
    );
    expectFail(
      auto({
        comment: { ...auto().comment, isHidden: true },
        channel: { status: 'expired', sendSuspended: true },
        automation: null,
      }),
      2,
      'comment_hidden',
      'cancel',
    );
    expectFail(
      auto({ channel: { status: 'expired', sendSuspended: true }, automation: null }),
      3,
      'channel_disconnected',
      'channel_error',
    );
    expectFail(
      auto({ automation: null, kb: null, quota: null, rate: { remaining: 0 } }),
      4,
      'automation_unknown',
      'hold_review',
    );
    expectFail(
      auto({ kb: null, quota: null, rate: { remaining: 0 } }),
      6,
      'kb_unknown',
      'hold_review',
    );
    expectFail(auto({ quota: null, rate: { remaining: 0 } }), 7, 'quota_unknown', 'hold_review');
  });

  it('FR-110 đầu vào hỏng (không phải object, mode lạ, số âm, ngày sai, trạng thái rỗng) → rule input, không gửi, không ném', () => {
    const bad: unknown[] = [
      null,
      undefined,
      42,
      'sending',
      {},
      human({ mode: 'robot' as never }),
      human({ now: 'hôm nay' as never }),
      human({ comment: { ...human().comment, status: '' } }),
      human({ rate: { remaining: -1 } }),
      auto({ quota: { ...auto().quota!, aiCostMonthUsd: Number.NaN } }),
      auto({ price: { hasMoney: true, snapshot: [price({ priceVnd: -1 })], current: [] } }),
      auto({ automation: { ...auto().automation!, level: 'on' as never } }),
    ];
    for (const raw of bad) {
      const r = sendRecheck(raw);
      expect(r, JSON.stringify(raw)).toEqual({
        ok: false,
        rule: 'recheck:input',
        reason: 'input_unreadable',
        action: 'hold_review',
        rulesPassed: 0,
      });
      expect(readSendRecheckInput(raw)).toBeNull();
    }
  });

  it('readSendRecheckInput đọc được ca mốc và đổi chuỗi ISO thành Date', () => {
    const parsed = readSendRecheckInput(
      auto({ target: 'message', message: { lastInboundAt: NOW, humanAgent: false } }),
    );
    expect(parsed?.now).toBeInstanceOf(Date);
    expect(parsed?.message?.lastInboundAt).toBeInstanceOf(Date);
    expect(parsed?.price?.snapshot[0]?.updatedFromSourceAt).toBeInstanceOf(Date);
  });
});

// ---------- property-based (fast-check, seed cố định) ----------

const SEED = 20261106;
const run = <T>(arb: fc.Arbitrary<T>, predicate: (v: T) => void) =>
  fc.assert(fc.property(arb, predicate), { seed: SEED, numRuns: 300 });

const iso = fc
  .integer({ min: Date.parse('2026-10-01T00:00:00Z'), max: Date.parse('2026-11-10T00:00:00Z') })
  .map((ms) => new Date(ms).toISOString());
const maybeId = fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: null });
const priceArb = fc.record({
  productId: fc.constantFrom('p1', 'p2', 'p3'),
  priceVnd: fc.constantFrom(99_000, 199_000, 299_000),
  updatedFromSourceAt: fc.option(fc.constantFrom(T0, NOW), { nil: null }),
});
const inputArb: fc.Arbitrary<SendRecheckInput> = fc.record({
  mode: fc.constantFrom('human', 'auto'),
  target: fc.constantFrom('comment', 'message'),
  now: fc.constant(NOW),
  comment: fc.record({
    status: fc.constantFrom('sending', 'scheduled_auto', 'replied', 'pending_review'),
    externalReplyId: maybeId,
    isHidden: fc.boolean(),
    mergedIntoId: maybeId,
    deletedAt: fc.option(iso, { nil: null }),
  }),
  channel: fc.record({
    status: fc.constantFrom('connected', 'expired', 'revoked'),
    sendSuspended: fc.boolean(),
  }),
  automation: fc.option(
    fc.record({
      aiEnabled: fc.boolean(),
      emergencyStopped: fc.boolean(),
      aiPaused: fc.boolean(),
      level: fc.constantFrom('off', 'shadow', 'auto'),
    }),
    { nil: null },
  ),
  price: fc.option(
    fc.record({
      hasMoney: fc.boolean(),
      snapshot: fc.array(priceArb, { maxLength: 3 }),
      current: fc.array(priceArb, { maxLength: 3 }),
    }),
    { nil: null },
  ),
  kb: fc.option(
    fc.record({
      draftVersion: fc.constantFrom('v1', 'v2'),
      currentVersion: fc.constantFrom('v1', 'v2'),
      changeAffectsDraft: fc.boolean(),
    }),
    { nil: null },
  ),
  quota: fc.option(
    fc.record({
      turnsRemaining: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
      aiCostCapUsd: fc.option(fc.constantFrom(0, 10, 50), { nil: null }),
      aiCostMonthUsd: fc.constantFrom(0, 10, 60),
      dailyCap: fc.option(fc.integer({ min: 0, max: 3 }), { nil: null }),
      autoSentToday: fc.integer({ min: 0, max: 4 }),
    }),
    { nil: null },
  ),
  message: fc.option(
    fc.record({
      lastInboundAt: fc
        .integer({ min: -2 * HOUR_MS, max: 8 * DAY_MS })
        .map((ago) => new Date(Date.parse(NOW) - ago).toISOString()),
      humanAgent: fc.boolean(),
    }),
    { nil: null },
  ),
  rate: fc.option(fc.record({ remaining: fc.integer({ min: 0, max: 2 }) }), { nil: null }),
}) as fc.Arbitrary<SendRecheckInput>;

/** Mô hình độc lập của từng điều kiện (viết lại từ bảng §6.1) để đối chiếu với hàm. */
function oracle(i: SendRecheckInput): number | null {
  const now = Date.parse(NOW);
  const c = i.comment;
  const autoMode = i.mode === 'auto';
  const sendable = autoMode ? ['sending', 'scheduled_auto'] : ['sending'];
  if (c.externalReplyId !== null || !sendable.includes(c.status)) return 1;
  if (c.deletedAt !== null || c.isHidden || c.mergedIntoId !== null) return 2;
  if (i.channel.status !== 'connected' || i.channel.sendSuspended) return 3;
  if (autoMode) {
    const a = i.automation;
    if (!a || !a.aiEnabled || a.emergencyStopped || a.aiPaused || a.level !== 'auto') return 4;
  }
  if (i.price === null && autoMode) return 5;
  if (i.price !== null && i.price.hasMoney) {
    if (i.price.snapshot.length === 0) return 5;
    for (const s of i.price.snapshot) {
      const cur = i.price.current.find((p) => p.productId === s.productId);
      const ts = (v: string | Date | null | undefined) =>
        v === null || v === undefined ? null : new Date(v).getTime();
      if (
        !cur ||
        cur.priceVnd !== s.priceVnd ||
        ts(cur.updatedFromSourceAt) !== ts(s.updatedFromSourceAt)
      )
        return 5;
    }
  }
  if (autoMode) {
    const k = i.kb;
    if (!k || (k.draftVersion !== k.currentVersion && k.changeAffectsDraft)) return 6;
    const q = i.quota;
    if (
      !q ||
      (q.turnsRemaining !== null && q.turnsRemaining <= 0) ||
      (q.aiCostCapUsd !== null && q.aiCostMonthUsd >= q.aiCostCapUsd) ||
      (q.dailyCap !== null && q.autoSentToday >= q.dailyCap)
    )
      return 7;
  }
  if (i.target === 'message') {
    const m = i.message;
    if (!m) return 8;
    const elapsed = now - new Date(m.lastInboundAt).getTime();
    const window = autoMode || !m.humanAgent ? AUTO_MESSAGE_WINDOW_MS : HUMAN_AGENT_WINDOW_MS;
    if (elapsed < -RECHECK_CLOCK_SKEW_MS || elapsed >= window) return 8;
  }
  if (i.rate !== null && i.rate.remaining <= 0) return 9;
  return null;
}

describe('FR-110 sendRecheck — property-based', () => {
  it('FR-110 ok ⇔ mọi điều kiện đúng; rule = điều kiện nhỏ nhất trượt; xác định; không ném', () => {
    run(inputArb, (input) => {
      const expected = oracle(input);
      const r = sendRecheck(input);
      expect(r).toEqual(sendRecheck(structuredClone(input)));
      if (expected === null) expect(r).toEqual(PASS);
      else {
        expect(r.ok).toBe(false);
        expect(r.rule).toBe(`recheck:R${expected}`);
        expect(r.rulesPassed).toBe(expected - 1);
      }
    });
  });

  it('FR-110 đổi thứ tự mảng giá (ảnh chụp / hiện tại) không đổi kết quả', () => {
    run(fc.tuple(inputArb, fc.array(fc.nat(), { minLength: 6, maxLength: 6 })), ([input, keys]) => {
      if (input.price === null) return;
      const shuffle = <T>(xs: readonly T[], offset: number): T[] =>
        xs
          .map((x, idx) => ({ x, k: keys[(idx + offset) % keys.length] ?? 0 }))
          .sort((a, b) => a.k - b.k)
          .map((p) => p.x);
      const shuffled: SendRecheckInput = {
        ...input,
        price: {
          hasMoney: input.price.hasMoney,
          snapshot: shuffle(input.price.snapshot, 0),
          current: shuffle(input.price.current, 3),
        },
      };
      expect(sendRecheck(shuffled)).toEqual(sendRecheck(input));
    });
  });

  it('FR-110 đơn điệu: làm trượt thêm một điều kiện bất kỳ không bao giờ biến "không gửi" thành "gửi"', () => {
    const breakers: Array<(i: SendRecheckInput) => SendRecheckInput> = [
      (i) => ({ ...i, comment: { ...i.comment, externalReplyId: 'x' } }),
      (i) => ({ ...i, comment: { ...i.comment, status: 'replied' } }),
      (i) => ({ ...i, comment: { ...i.comment, isHidden: true } }),
      (i) => ({ ...i, comment: { ...i.comment, deletedAt: T0 } }),
      (i) => ({ ...i, channel: { ...i.channel, status: 'expired' } }),
      (i) => ({ ...i, channel: { ...i.channel, sendSuspended: true } }),
      (i) => ({ ...i, automation: null }),
      (i) => ({
        ...i,
        automation: { aiEnabled: true, emergencyStopped: true, aiPaused: false, level: 'auto' },
      }),
      (i) => ({ ...i, price: { hasMoney: true, snapshot: [price()], current: [] } }),
      (i) => ({ ...i, kb: null }),
      (i) => ({ ...i, quota: null }),
      (i) => ({ ...i, message: null }),
      (i) => ({ ...i, rate: { remaining: 0 } }),
    ];
    run(fc.tuple(inputArb, fc.nat({ max: breakers.length - 1 })), ([input, k]) => {
      const before = sendRecheck(input);
      const after = sendRecheck(breakers[k]!(input));
      if (!before.ok) expect(after.ok).toBe(false);
    });
  });

  it('FR-110 dữ liệu tùy ý không bao giờ ném; kết quả luôn có dạng hợp lệ', () => {
    run(fc.anything(), (raw) => {
      const r = sendRecheck(raw);
      expect(typeof r.ok).toBe('boolean');
      expect(r.rulesPassed).toBeGreaterThanOrEqual(0);
      expect(r.rulesPassed).toBeLessThanOrEqual(RECHECK_COUNT);
      if (r.ok) expect(r.rule).toBeNull();
      else expect(r.rule).toMatch(/^recheck:(input|R[1-9])$/);
    });
  });
});

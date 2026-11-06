import { COMMENT_LABELS } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ACTION_KINDS } from '../confidence/confidence';
import { AUTO_SEND_POLICIES } from '../decide/decide-action';
import {
  AUTO_SEND_OUTCOMES,
  type AutoSendInput,
  CLOCK_SKEW_MS,
  DEFAULT_THRESHOLD,
  decideAutoSend,
  GATE_COUNT,
  MESSAGE_WINDOW_HOURS,
  READINESS_MIN_PERCENT,
  readAutoSendInput,
  THRESHOLD_FLOOR,
} from './auto-send-gate';

const NOW = '2026-11-06T03:00:00.000Z'; // 10:00 thứ Sáu giờ Việt Nam
const HOUR_MS = 3_600_000;

/** Ca mốc: qua đủ 11 cổng ở mức Tự động. */
function base(over: Partial<AutoSendInput> = {}): AutoSendInput {
  return {
    target: 'comment',
    now: NOW,
    workspace: {
      aiEnabled: true,
      emergencyStopped: false,
      aiCostCapUsd: 50,
      aiCostMonthUsd: 10,
    },
    levels: { channelLabel: 'auto', post: null },
    settings: {
      threshold: DEFAULT_THRESHOLD,
      dailyCap: 100,
      blockedLabels: ['complaint'],
      blockedKeywords: ['bảo hành'],
      allowPartial: false,
      allowClarify: true,
      activeHours: {
        timezone: 'Asia/Ho_Chi_Minh',
        windows: [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00' }],
      },
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
    usage: { autoSentToday: 3 },
    message: null,
    ...over,
  };
}

function expectHold(input: AutoSendInput, gate: number, reason: string) {
  const r = decideAutoSend(input);
  expect(r.outcome).toBe('hold');
  expect(r.failedGate).toBe(`gate:${gate}`);
  expect(r.reason).toBe(reason);
  expect(r.gatesPassed).toBe(gate - 1);
}

describe('FR-031 decideAutoSend — qua đủ 11 cổng', () => {
  it('mức Tự động, mọi cổng qua → auto_send, không cổng trượt', () => {
    expect(decideAutoSend(base())).toEqual({
      outcome: 'auto_send',
      failedGate: null,
      reason: null,
      gatesPassed: GATE_COUNT,
    });
  });

  it('mức Chạy thử (cổng 2) → vẫn chạy đủ cổng rồi trả would_send', () => {
    const r = decideAutoSend(base({ levels: { channelLabel: 'shadow', post: null } }));
    expect(r).toMatchObject({ outcome: 'would_send', failedGate: null, gatesPassed: GATE_COUNT });
  });

  it('Chạy thử nhưng cổng sau trượt → hold với cổng đó (log "sẽ gửi" không được sai)', () => {
    expectHold(
      base({ levels: { channelLabel: 'shadow', post: null }, usage: { autoSentToday: 100 } }),
      8,
      'daily_cap_reached',
    );
  });

  it('tin nhắn còn trong cửa sổ 24 giờ → auto_send', () => {
    const last = new Date(Date.parse(NOW) - 23 * HOUR_MS).toISOString();
    const r = decideAutoSend(base({ target: 'message', message: { lastInboundAt: last } }));
    expect(r.outcome).toBe('auto_send');
  });

  it('không có hành động "ẩn" trong mọi kết quả có thể', () => {
    expect(AUTO_SEND_OUTCOMES).toEqual(['auto_send', 'would_send', 'hold']);
    expect(AUTO_SEND_OUTCOMES).not.toContain('hide');
  });
});

describe('FR-031 cổng 1 — công tắc workspace + dừng khẩn cấp', () => {
  it('ai_enabled tắt → gate:1 workspace_ai_off', () => {
    expectHold(
      base({ workspace: { ...base().workspace, aiEnabled: false } }),
      1,
      'workspace_ai_off',
    );
  });
  it('dừng khẩn cấp → gate:1 emergency_stopped', () => {
    expectHold(
      base({ workspace: { ...base().workspace, emergencyStopped: true } }),
      1,
      'emergency_stopped',
    );
  });
});

describe('FR-031 cổng 2 — mức kênh × nhãn', () => {
  it('Tắt → gate:2 mode_off', () => {
    expectHold(base({ levels: { channelLabel: 'off', post: null } }), 2, 'mode_off');
  });
});

describe('FR-031 cổng 3 — ghi đè theo bài viết', () => {
  it('bài ghi đè Tắt → gate:3 post_override_off', () => {
    expectHold(base({ levels: { channelLabel: 'auto', post: 'off' } }), 3, 'post_override_off');
  });
  it('bài ghi đè Chạy thử → would_send', () => {
    expect(decideAutoSend(base({ levels: { channelLabel: 'auto', post: 'shadow' } })).outcome).toBe(
      'would_send',
    );
  });
  it('bài ghi đè Tự động khi kênh Chạy thử → vẫn Chạy thử (cổng 2 đã quyết, không mở rộng quyền)', () => {
    expect(decideAutoSend(base({ levels: { channelLabel: 'shadow', post: 'auto' } })).outcome).toBe(
      'would_send',
    );
  });
});

describe('FR-031 FR-145 cổng 4 — nhãn bị chặn (mọi nhãn trong labels[])', () => {
  it('nhãn phụ là Khiếu nại → gate:4 label_blocked', () => {
    expectHold(base({ labels: ['price', 'complaint'] }), 4, 'label_blocked');
  });
  it('Khiếu nại luôn bị chặn dù danh sách cài đặt rỗng', () => {
    expectHold(
      base({ labels: ['complaint'], settings: { ...base().settings, blockedLabels: [] } }),
      4,
      'label_blocked',
    );
  });
  it('Owner chặn thêm nhãn Spam → Spam bị chặn', () => {
    expectHold(
      base({
        labels: ['advice', 'spam'],
        settings: { ...base().settings, blockedLabels: ['spam'] },
      }),
      4,
      'label_blocked',
    );
  });
  it('nhãn không trong danh sách → qua', () => {
    expect(decideAutoSend(base({ labels: ['advice', 'purchase'] })).outcome).toBe('auto_send');
  });
});

describe('FR-031 FR-163 cổng 5 — ngưỡng độ tin cậy', () => {
  it('dưới ngưỡng → gate:5 confidence_below_threshold', () => {
    expectHold(base({ confidence: 0.849 }), 5, 'confidence_below_threshold');
  });
  it('đúng ngưỡng → qua', () => {
    expect(decideAutoSend(base({ confidence: 0.85 })).outcome).toBe('auto_send');
  });
  it('ngưỡng cài 0,70 bị nâng lên sàn 0,80', () => {
    expect(THRESHOLD_FLOOR).toBe(0.8);
    const s = { ...base().settings, threshold: 0.7 };
    expectHold(base({ settings: s, confidence: 0.79 }), 5, 'confidence_below_threshold');
    expect(decideAutoSend(base({ settings: s, confidence: 0.8 })).outcome).toBe('auto_send');
  });
  it('ngưỡng cài 0,95 được giữ', () => {
    expectHold(
      base({ settings: { ...base().settings, threshold: 0.95 }, confidence: 0.9 }),
      5,
      'confidence_below_threshold',
    );
  });
});

describe('FR-031 FR-141 FR-147 cổng 6 — code tính lại "cần người"', () => {
  it('action = handoff → gate:6 handoff_action, bất kể điểm cao', () => {
    expectHold(
      base({
        decision: {
          action: 'handoff',
          needsHuman: true,
          autoSendPolicy: 'never',
          unansweredTopics: [],
        },
        confidence: 0.99,
      }),
      6,
      'handoff_action',
    );
  });
  it('decision.needsHuman (ảnh chưa nhận sản phẩm theo decideAction) → decision_needs_human', () => {
    expectHold(
      base({
        decision: {
          action: 'clarify',
          needsHuman: true,
          autoSendPolicy: 'never',
          unansweredTopics: [],
        },
      }),
      6,
      'decision_needs_human',
    );
  });
  it('autoSendPolicy = never (không needsHuman) → policy_never', () => {
    expectHold(
      base({
        decision: {
          action: 'answer',
          needsHuman: false,
          autoSendPolicy: 'never',
          unansweredTopics: [],
        },
      }),
      6,
      'policy_never',
    );
  });
  it('AI xin duyệt (draft.needsHuman) → draft_needs_human — AI được THÊM điều kiện cần duyệt', () => {
    expectHold(base({ draft: { ...base().draft, needsHuman: true } }), 6, 'draft_needs_human');
  });
  it('số tiền không có trong nguồn (toàn văn reply) → money_unsourced', () => {
    expectHold(
      base({ draft: { ...base().draft, reply: 'Dạ áo giá 250.000đ ạ.', claims: [] } }),
      6,
      'money_unsourced',
    );
  });
  it('giá đọc từ products (knownPricesVnd) là nguồn hợp lệ', () => {
    const r = decideAutoSend(base({ grounding: { sourceTexts: [], knownPricesVnd: [199_000] } }));
    expect(r.outcome).toBe('auto_send');
  });
  it('nguồn kiểm tiền tách khỏi bản nháp: AI tự ghi sources trong draft không được tính', () => {
    const raw = {
      ...base(),
      grounding: { sourceTexts: [] },
      draft: { ...base().draft, sources: ['Áo thun A: 199.000đ'] },
    };
    expectHold(raw as AutoSendInput, 6, 'money_unsourced');
  });
  it('khách rất bực → customer_angry', () => {
    expectHold(base({ flags: { ...base().flags, customerAngry: true } }), 6, 'customer_angry');
  });
  it('dấu hiệu prompt injection → prompt_injection', () => {
    expectHold(base({ flags: { ...base().flags, promptInjection: true } }), 6, 'prompt_injection');
  });
  it('khách hỏi lại ≥ 3 lần → repeat_limit; 2 lần → qua', () => {
    expectHold(base({ flags: { ...base().flags, repeatCount: 3 } }), 6, 'repeat_limit');
    expect(decideAutoSend(base({ flags: { ...base().flags, repeatCount: 2 } })).outcome).toBe(
      'auto_send',
    );
  });
  it('FR-143 câu phụ thuộc ảnh chưa nhận sản phẩm → image_product_unresolved', () => {
    expectHold(
      base({ flags: { ...base().flags, imageProductUnresolved: true } }),
      6,
      'image_product_unresolved',
    );
  });
  it('FR-141 trả lời một phần mà allow_partial tắt → partial_not_allowed; bật → qua', () => {
    const decision: AutoSendInput['decision'] = {
      action: 'redirect',
      needsHuman: false,
      autoSendPolicy: 'allow_partial',
      unansweredTopics: ['shipping'],
    };
    expectHold(base({ decision }), 6, 'partial_not_allowed');
    expect(
      decideAutoSend(base({ decision, settings: { ...base().settings, allowPartial: true } }))
        .outcome,
    ).toBe('auto_send');
  });
  it('FR-141 có unanswered_topics dù chính sách standard → vẫn xét allow_partial', () => {
    expectHold(
      base({
        decision: {
          action: 'answer',
          needsHuman: false,
          autoSendPolicy: 'standard',
          unansweredTopics: ['discount'],
        },
      }),
      6,
      'partial_not_allowed',
    );
  });
  it('FR-147 câu hỏi lại không có ý fact → xét allow_clarify (tắt → clarify_not_allowed)', () => {
    const decision: AutoSendInput['decision'] = {
      action: 'clarify',
      needsHuman: false,
      autoSendPolicy: 'allow_clarify',
      unansweredTopics: [],
    };
    const draft: AutoSendInput['draft'] = {
      reply: 'Dạ chị hỏi mẫu nào ạ?',
      needsHuman: false,
      claims: [{ kind: 'question_back' }],
      unansweredTopics: [],
    };
    expectHold(
      base({ decision, draft, settings: { ...base().settings, allowClarify: false } }),
      6,
      'clarify_not_allowed',
    );
    expect(decideAutoSend(base({ decision, draft })).outcome).toBe('auto_send');
  });
  it('FR-147 câu chuyển hướng có ý fact → nâng thành allow_partial (allow_clarify bật không đủ)', () => {
    const decision: AutoSendInput['decision'] = {
      action: 'redirect',
      needsHuman: false,
      autoSendPolicy: 'allow_clarify',
      unansweredTopics: ['shipping'],
    };
    expectHold(base({ decision }), 6, 'partial_not_allowed');
  });
  it('FR-031 hồi quy: AI thêm ý fact vào câu hỏi lại KHÔNG mở được cổng khi allow_clarify tắt', () => {
    const decision: AutoSendInput['decision'] = {
      action: 'redirect',
      needsHuman: false,
      autoSendPolicy: 'allow_clarify',
      unansweredTopics: ['shipping'],
    };
    const settings = { ...base().settings, allowClarify: false, allowPartial: true };
    expectHold(
      base({ decision, settings, draft: { ...base().draft, claims: [] } }),
      6,
      'clarify_not_allowed',
    );
    expectHold(
      base({ decision, settings, draft: { ...base().draft, claims: [{ kind: 'fact' }] } }),
      6,
      'clarify_not_allowed',
    );
  });
  it('FR-141 hồi quy: AI tự ghi unanswered_topics → trả lời một phần → cần allow_partial', () => {
    const draft = { ...base().draft, unansweredTopics: ['shipping'] };
    expectHold(base({ draft }), 6, 'partial_not_allowed');
    expect(
      decideAutoSend(base({ draft, settings: { ...base().settings, allowPartial: true } })).outcome,
    ).toBe('auto_send');
  });
  it('FR-141 ý kind=handoff (câu mời ib) trong bản nháp → trả lời một phần', () => {
    expectHold(
      base({ draft: { ...base().draft, claims: [{ kind: 'fact' }, { kind: 'handoff' }] } }),
      6,
      'partial_not_allowed',
    );
  });
  it('FR-146 độ sẵn sàng < 80% → readiness_low; đúng 80 → qua', () => {
    expect(READINESS_MIN_PERCENT).toBe(80);
    expectHold(base({ flags: { ...base().flags, readinessPercent: 79.9 } }), 6, 'readiness_low');
    expect(decideAutoSend(base({ flags: { ...base().flags, readinessPercent: 80 } })).outcome).toBe(
      'auto_send',
    );
  });
  it('FR-154 nhân viên đang giữ chuỗi → human_holding', () => {
    expectHold(base({ flags: { ...base().flags, humanHolding: true } }), 6, 'human_holding');
  });
});

describe('FR-031 cổng 7 — từ khóa chặn', () => {
  it('có từ khóa (không dấu, hoa thường, chuỗi con) → gate:7 blocked_keyword', () => {
    expectHold(
      base({ draft: { ...base().draft, reply: 'Dạ áo thun A giá 199.000đ, BAO HANH 6 tháng ạ.' } }),
      7,
      'blocked_keyword',
    );
  });
  it('không lách được bằng ký tự rộng 0 hay chữ toàn khổ (NFKC)', () => {
    const reply = (s: string) => base({ draft: { ...base().draft, reply: s } });
    expectHold(reply('Dạ áo 199.000đ, bả​o hà‍nh 6 tháng ạ.'), 7, 'blocked_keyword');
    expectHold(reply('Dạ áo 199.000đ, ｂảｏ ｈàｎｈ ạ.'), 7, 'blocked_keyword');
  });
  it('từ khóa rỗng/chỉ dấu câu bị bỏ qua, không chặn mọi câu', () => {
    const r = decideAutoSend(
      base({ settings: { ...base().settings, blockedKeywords: ['', ' !! '] } }),
    );
    expect(r.outcome).toBe('auto_send');
  });
});

describe('FR-031 cổng 8 — giới hạn tự gửi/ngày', () => {
  it('đã đủ giới hạn → gate:8 daily_cap_reached; còn 1 → qua; không đặt → qua', () => {
    expectHold(base({ usage: { autoSentToday: 100 } }), 8, 'daily_cap_reached');
    expect(decideAutoSend(base({ usage: { autoSentToday: 99 } })).outcome).toBe('auto_send');
    expect(
      decideAutoSend(
        base({
          usage: { autoSentToday: 10_000 },
          settings: { ...base().settings, dailyCap: null },
        }),
      ).outcome,
    ).toBe('auto_send');
  });
  it('giới hạn 0 → không bao giờ tự gửi', () => {
    expectHold(
      base({ usage: { autoSentToday: 0 }, settings: { ...base().settings, dailyCap: 0 } }),
      8,
      'daily_cap_reached',
    );
  });
});

describe('FR-031 cổng 9 — trần chi phí AI của workspace', () => {
  it('chi phí tháng ≥ trần → gate:9 cost_cap_reached; không trần → qua', () => {
    expectHold(
      base({ workspace: { ...base().workspace, aiCostMonthUsd: 50 } }),
      9,
      'cost_cap_reached',
    );
    expect(
      decideAutoSend(
        base({ workspace: { ...base().workspace, aiCostCapUsd: null, aiCostMonthUsd: 999 } }),
      ).outcome,
    ).toBe('auto_send');
  });
});

describe('FR-031 cổng 10 — giờ hoạt động', () => {
  it('ngoài khung giờ (21:00 giờ VN) → gate:10 outside_active_hours', () => {
    expectHold(base({ now: '2026-11-06T14:00:00.000Z' }), 10, 'outside_active_hours');
  });
  it('đúng ngày nghỉ (Chủ nhật) → trượt; không cài giờ → luôn qua', () => {
    expectHold(base({ now: '2026-11-08T03:00:00.000Z' }), 10, 'outside_active_hours');
    expect(
      decideAutoSend(
        base({
          now: '2026-11-08T03:00:00.000Z',
          settings: { ...base().settings, activeHours: null },
        }),
      ).outcome,
    ).toBe('auto_send');
  });
  it('biên: đúng giờ mở → qua, đúng giờ đóng → trượt; "24:00" là hết ngày', () => {
    const at = (iso: string) => decideAutoSend(base({ now: iso })).outcome;
    expect(at('2026-11-06T01:00:00.000Z')).toBe('auto_send'); // 08:00
    expect(at('2026-11-06T11:00:00.000Z')).toBe('hold'); // 18:00
    const allDay = {
      timezone: 'Asia/Ho_Chi_Minh',
      windows: [{ days: [5], from: '00:00', to: '24:00' }],
    };
    expect(
      decideAutoSend(
        base({
          now: '2026-11-06T16:59:00.000Z',
          settings: { ...base().settings, activeHours: allDay },
        }),
      ).outcome,
    ).toBe('auto_send'); // 23:59 thứ Sáu
  });
  it('khung from = to là khung rỗng → luôn ngoài giờ', () => {
    const empty = {
      timezone: 'Asia/Ho_Chi_Minh',
      windows: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '10:00', to: '10:00' }],
    };
    expectHold(
      base({ settings: { ...base().settings, activeHours: empty } }),
      10,
      'outside_active_hours',
    );
  });
  it('khung qua đêm 22:00–02:00 kéo sang ngày sau', () => {
    const night = {
      timezone: 'Asia/Ho_Chi_Minh',
      windows: [{ days: [5], from: '22:00', to: '02:00' }],
    };
    const settings = { ...base().settings, activeHours: night };
    expect(decideAutoSend(base({ now: '2026-11-06T16:00:00.000Z', settings })).outcome).toBe(
      'auto_send',
    ); // 23:00 thứ Sáu
    expect(decideAutoSend(base({ now: '2026-11-06T18:00:00.000Z', settings })).outcome).toBe(
      'auto_send',
    ); // 01:00 thứ Bảy
    expect(decideAutoSend(base({ now: '2026-11-06T19:00:00.000Z', settings })).outcome).toBe(
      'hold',
    ); // 02:00 thứ Bảy
    expect(decideAutoSend(base({ now: '2026-11-06T03:00:00.000Z', settings })).outcome).toBe(
      'hold',
    ); // 10:00 thứ Sáu
  });
});

describe('FR-031 cổng 11 — cửa sổ 24 giờ (chỉ tin nhắn)', () => {
  it('tin cuối của khách quá 24 giờ → gate:11 message_window_closed', () => {
    expect(MESSAGE_WINDOW_HOURS).toBe(24);
    const last = new Date(Date.parse(NOW) - 24 * HOUR_MS).toISOString();
    expectHold(
      base({ target: 'message', message: { lastInboundAt: last } }),
      11,
      'message_window_closed',
    );
  });
  it('tin nhắn thiếu mốc tin cuối → chặn (thiên về chặn)', () => {
    expectHold(base({ target: 'message', message: null }), 11, 'message_window_closed');
  });
  it('mốc tin cuối ở tương lai: lệch ≤ 5 phút chấp nhận, quá → chặn (dữ liệu hỏng)', () => {
    expect(CLOCK_SKEW_MS).toBe(300_000);
    const at = (ms: number) =>
      decideAutoSend(
        base({
          target: 'message',
          message: { lastInboundAt: new Date(Date.parse(NOW) + ms).toISOString() },
        }),
      );
    expect(at(60_000).outcome).toBe('auto_send');
    expect(at(CLOCK_SKEW_MS + 1).failedGate).toBe('gate:11');
  });
  it('bình luận bỏ qua cổng 11 dù có mốc cũ', () => {
    const last = new Date(Date.parse(NOW) - 72 * HOUR_MS).toISOString();
    expect(
      decideAutoSend(base({ target: 'comment', message: { lastInboundAt: last } })).outcome,
    ).toBe('auto_send');
  });
});

describe('FR-031 thứ tự cổng — nhiều cổng trượt thì báo cổng nhỏ nhất', () => {
  it('tắt workspace + nhãn chặn + quá giới hạn → gate:1', () => {
    expectHold(
      base({
        workspace: { ...base().workspace, aiEnabled: false },
        labels: ['complaint'],
        usage: { autoSentToday: 100 },
      }),
      1,
      'workspace_ai_off',
    );
  });
  it('nhãn chặn + dưới ngưỡng → gate:4 trước gate:5', () => {
    expectHold(base({ labels: ['complaint'], confidence: 0.1 }), 4, 'label_blocked');
  });
  it('handoff + từ khóa chặn → gate:6 trước gate:7', () => {
    expectHold(
      base({
        decision: {
          action: 'handoff',
          needsHuman: true,
          autoSendPolicy: 'never',
          unansweredTopics: [],
        },
        draft: { ...base().draft, reply: 'bảo hành' },
      }),
      6,
      'handoff_action',
    );
  });
});

describe('FR-031 FR-032 đầu vào hỏng → chờ duyệt, không ném', () => {
  it.each([
    ['không phải object', null],
    ['thiếu workspace', { ...base(), workspace: undefined }],
    ['nhãn lạ', base({ labels: ['vip' as never] })],
    ['độ tin cậy > 1', base({ confidence: 1.2 })],
    ['số đã gửi âm', base({ usage: { autoSentToday: -1 } })],
    ['now không phải ngày', base({ now: 'hôm nay' })],
    ['now không phải ISO ("1" → năm 2001)', base({ now: '1' })],
    [
      'loại ý lạ do AI đặt ("Fact")',
      base({ draft: { ...base().draft, claims: [{ kind: 'Fact' as never }] } }),
    ],
    [
      'nhãn chặn không phải mã chuẩn ("Spam")',
      base({ settings: { ...base().settings, blockedLabels: ['Spam' as never] } }),
    ],
    ['thiếu grounding', { ...base(), grounding: undefined }],
    [
      'thiếu draft.unansweredTopics',
      { ...base(), draft: { reply: 'x', needsHuman: false, claims: [] } },
    ],
    [
      'múi giờ lạ',
      base({
        settings: { ...base().settings, activeHours: { timezone: 'Mars/Olympus', windows: [] } },
      }),
    ],
    [
      'giờ sai định dạng',
      base({
        settings: {
          ...base().settings,
          activeHours: { timezone: 'UTC', windows: [{ days: [1], from: '8h', to: '17:00' }] },
        },
      }),
    ],
    ['nhãn rỗng', base({ labels: [] })],
  ])('%s', (_name, raw) => {
    const r = decideAutoSend(raw);
    expect(r).toEqual({
      outcome: 'hold',
      failedGate: 'input',
      reason: 'input_unreadable',
      gatesPassed: 0,
    });
  });

  it('readAutoSendInput trả null khi hỏng, object khi hợp lệ; trường lạ của AI bị bỏ', () => {
    expect(readAutoSendInput(undefined)).toBeNull();
    const parsed = readAutoSendInput({ ...base(), draft: { ...base().draft, auto_send: true } });
    if (parsed === null) throw new Error('đầu vào hợp lệ phải đọc được');
    expect((parsed.draft as Record<string, unknown>).auto_send).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Property-based (STANDARD §5): thứ tự cổng, đơn điệu, không phụ thuộc thứ tự đầu vào.
// ---------------------------------------------------------------------------------------------

const SEED = 20261106;
const RUNS = 200;

const modeArb = fc.constantFrom('off', 'shadow', 'auto' as const);
const labelArb = fc.constantFrom(...COMMENT_LABELS);
const actionArb = fc.constantFrom(...ACTION_KINDS);
const policyArb = fc.constantFrom(...AUTO_SEND_POLICIES);
const topicArb = fc.constantFrom('shipping', 'discount', 'size');
const unit = fc.double({ min: 0, max: 1, noNaN: true });

const inputArb: fc.Arbitrary<AutoSendInput> = fc.record({
  target: fc.constantFrom('comment', 'message' as const),
  now: fc.constant(NOW),
  workspace: fc.record({
    aiEnabled: fc.boolean(),
    emergencyStopped: fc.boolean(),
    aiCostCapUsd: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: null }),
    aiCostMonthUsd: fc.double({ min: 0, max: 100, noNaN: true }),
  }),
  levels: fc.record({ channelLabel: modeArb, post: fc.option(modeArb, { nil: null }) }),
  settings: fc.record({
    threshold: unit,
    dailyCap: fc.option(fc.integer({ min: 0, max: 5 }), { nil: null }),
    blockedLabels: fc.uniqueArray(labelArb, { maxLength: 3 }),
    blockedKeywords: fc.uniqueArray(fc.constantFrom('bảo hành', 'giá', 'xyz'), { maxLength: 3 }),
    allowPartial: fc.boolean(),
    allowClarify: fc.boolean(),
    activeHours: fc.option(
      fc.record({
        timezone: fc.constant('Asia/Ho_Chi_Minh'),
        windows: fc.array(
          fc.record({
            days: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 7 }),
            from: fc.constantFrom('00:00', '08:00', '12:00', '22:00'),
            to: fc.constantFrom('02:00', '09:00', '18:00', '24:00'),
          }),
          { maxLength: 2 },
        ),
      }),
      { nil: null },
    ),
  }),
  labels: fc.uniqueArray(labelArb, { minLength: 1, maxLength: 3 }),
  confidence: unit,
  decision: fc.record({
    action: actionArb,
    needsHuman: fc.boolean(),
    autoSendPolicy: policyArb,
    unansweredTopics: fc.uniqueArray(topicArb, { maxLength: 2 }),
  }),
  draft: fc.record({
    reply: fc.constantFrom('Dạ áo giá 199.000đ ạ.', 'Dạ chị hỏi mẫu nào ạ?', 'Giá 250k ạ'),
    needsHuman: fc.boolean(),
    claims: fc.array(
      fc.record({ kind: fc.constantFrom('fact', 'greeting', 'question_back', 'handoff' as const) }),
      { maxLength: 2 },
    ),
    unansweredTopics: fc.uniqueArray(topicArb, { maxLength: 2 }),
  }),
  grounding: fc.record({
    sourceTexts: fc.subarray(['Áo thun A: 199.000đ', 'Giao hàng 2–3 ngày']),
  }),
  flags: fc.record({
    customerAngry: fc.boolean(),
    promptInjection: fc.boolean(),
    repeatCount: fc.integer({ min: 0, max: 4 }),
    imageProductUnresolved: fc.boolean(),
    humanHolding: fc.boolean(),
    readinessPercent: fc.double({ min: 0, max: 100, noNaN: true }),
  }),
  usage: fc.record({ autoSentToday: fc.integer({ min: 0, max: 6 }) }),
  message: fc.option(
    fc.record({
      lastInboundAt: fc
        .integer({ min: 0, max: 48 })
        .map((h) => new Date(Date.parse(NOW) - h * HOUR_MS).toISOString()),
    }),
    { nil: null },
  ),
});

/** Các cách làm trượt một cổng bất kỳ (để kiểm tính đơn điệu). */
const breakers: ReadonlyArray<(i: AutoSendInput) => AutoSendInput> = [
  (i) => ({ ...i, workspace: { ...i.workspace, emergencyStopped: true } }),
  (i) => ({ ...i, levels: { ...i.levels, channelLabel: 'off' } }),
  (i) => ({ ...i, levels: { ...i.levels, post: 'off' } }),
  (i) => ({ ...i, labels: [...i.labels, 'complaint'] }),
  (i) => ({ ...i, confidence: 0 }),
  (i) => ({ ...i, draft: { ...i.draft, needsHuman: true } }),
  (i) => ({ ...i, flags: { ...i.flags, humanHolding: true } }),
  (i) => ({ ...i, settings: { ...i.settings, blockedKeywords: ['ạ'] } }),
  (i) => ({ ...i, settings: { ...i.settings, dailyCap: 0 } }),
  (i) => ({ ...i, workspace: { ...i.workspace, aiCostCapUsd: 0 } }),
  (i) => ({ ...i, settings: { ...i.settings, activeHours: { timezone: 'UTC', windows: [] } } }),
  (i) => ({ ...i, target: 'message', message: null }),
];

const shuffled = <T>(arr: readonly T[]) => fc.shuffledSubarray([...arr], { minLength: arr.length });

describe('FR-031 property-based — thứ tự cổng và đơn điệu', () => {
  it('kết quả luôn thuộc 3 loại; failedGate đúng dạng; gatesPassed nhất quán', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const r = decideAutoSend(input);
        expect(AUTO_SEND_OUTCOMES).toContain(r.outcome);
        if (r.outcome === 'hold') {
          expect(r.failedGate).toMatch(/^gate:(?:[1-9]|1[01])$/);
          expect(r.gatesPassed).toBe(Number(r.failedGate?.slice(5)) - 1);
          expect(r.reason).not.toBeNull();
        } else {
          expect(r).toMatchObject({ failedGate: null, reason: null, gatesPassed: GATE_COUNT });
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('xác định: cùng đầu vào → cùng kết quả', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        expect(decideAutoSend(input)).toEqual(decideAutoSend(structuredClone(input)));
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('đổi thứ tự labels/blockedLabels/blockedKeywords/claims/sources không đổi kết quả', () => {
    const pairArb = inputArb.chain((input) =>
      fc
        .record({
          labels: shuffled(input.labels),
          blockedLabels: shuffled(input.settings.blockedLabels),
          blockedKeywords: shuffled(input.settings.blockedKeywords),
          claims: shuffled(input.draft.claims),
          sources: shuffled(input.grounding.sourceTexts),
        })
        .map((v): [AutoSendInput, AutoSendInput] => [
          input,
          {
            ...input,
            labels: v.labels,
            settings: {
              ...input.settings,
              blockedLabels: v.blockedLabels,
              blockedKeywords: v.blockedKeywords,
            },
            draft: { ...input.draft, claims: v.claims },
            grounding: { ...input.grounding, sourceTexts: v.sources },
          },
        ]),
    );
    fc.assert(
      fc.property(pairArb, ([input, permuted]) => {
        expect(decideAutoSend(permuted)).toEqual(decideAutoSend(input));
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('đơn điệu: làm trượt thêm một cổng không bao giờ biến hold thành gửi, và cổng báo không lớn hơn', () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 0, max: breakers.length - 1 }), (input, k) => {
        const before = decideAutoSend(input);
        const breaker = breakers[k];
        if (breaker === undefined) throw new Error('breaker thiếu');
        const after = decideAutoSend(breaker(input));
        if (before.outcome === 'hold') {
          expect(after.outcome).toBe('hold');
          expect(after.gatesPassed).toBeLessThanOrEqual(before.gatesPassed);
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('gửi được ⇔ mọi vị từ cổng đều đúng (kiểm độc lập với thứ tự cài trong module)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const r = decideAutoSend(input);
        const allBreakersStillPass = breakers.every((b) => {
          const after = decideAutoSend(b(input));
          return after.outcome === 'hold';
        });
        if (r.outcome !== 'hold') {
          // Mọi cách phá đều phải chặn được một câu đang gửi được.
          expect(allBreakersStillPass).toBe(true);
          expect(input.workspace.aiEnabled && !input.workspace.emergencyStopped).toBe(true);
          expect(input.levels.channelLabel).not.toBe('off');
          expect(input.labels).not.toContain('complaint');
          expect(input.confidence).toBeGreaterThanOrEqual(THRESHOLD_FLOOR);
          expect(input.decision.action).not.toBe('handoff');
          expect(input.decision.needsHuman || input.draft.needsHuman).toBe(false);
          expect(input.flags.readinessPercent).toBeGreaterThanOrEqual(READINESS_MIN_PERCENT);
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('dữ liệu tùy ý không ném', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        expect(() => decideAutoSend(raw)).not.toThrow();
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

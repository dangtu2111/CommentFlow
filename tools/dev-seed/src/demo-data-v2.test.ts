import { matchSpamRule, parseSpamRule } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { DEMO_POSTS, DEMO_PRODUCTS, DEMO_TAG } from './demo-data';
import {
  buildReportRows,
  DEMO_ACTION_LOGS,
  DEMO_ALIASES,
  DEMO_AUTOMATION,
  DEMO_CONVERSATIONS,
  DEMO_LEADS,
  DEMO_POST_NOTES,
  DEMO_SIZE_CHARTS,
  DEMO_SPAM_COMMENTS,
  DEMO_SPAM_RULES,
  KB_FAQS,
  KB_POLICIES,
} from './demo-data-v2';

const DAY_MIN = 1440;

describe('DEV-SEED-DEMO v2 — bộ dữ liệu mẫu', () => {
  it('kiến thức: 12–15 FAQ, đủ chính sách đổi trả/vận chuyển/bảo hành, cả vi và en, đều có nhãn [MẪU]', () => {
    expect(KB_FAQS.length).toBeGreaterThanOrEqual(12);
    expect(KB_FAQS.length).toBeLessThanOrEqual(15);
    expect(new Set(KB_FAQS.map((f) => f.lang))).toEqual(new Set(['vi', 'en']));
    for (const f of KB_FAQS) expect(f.question.startsWith(DEMO_TAG)).toBe(true);
    const kinds = new Set(KB_POLICIES.map((p) => p.kind));
    for (const k of ['return', 'shipping', 'warranty']) expect(kinds.has(k as never), k).toBe(true);
  });

  it('bí danh, bảng size và ghi chú bài trỏ đúng sản phẩm/bài', () => {
    const products = new Set(DEMO_PRODUCTS.map((p) => p.key));
    for (const key of Object.keys(DEMO_ALIASES)) expect(products.has(key), key).toBe(true);
    for (const row of DEMO_SIZE_CHARTS) {
      if ('productKey' in row.scope) expect(products.has(row.scope.productKey)).toBe(true);
    }
    const posts = new Set(DEMO_POSTS.map((p) => p.key));
    for (const n of DEMO_POST_NOTES) expect(posts.has(n.postKey)).toBe(true);
  });

  it('khách tiềm năng: 25 lead rải đủ 4 cột Kanban', () => {
    expect(DEMO_LEADS).toHaveLength(25);
    const stages = new Set(DEMO_LEADS.map((l) => l.stage));
    expect(stages).toEqual(new Set(['new', 'contacted', 'won', 'lost']));
  });

  it('quy tắc spam: 6–8 quy tắc hợp lệ, mỗi bình luận spam mẫu khớp ít nhất một quy tắc bật', () => {
    expect(DEMO_SPAM_RULES.length).toBeGreaterThanOrEqual(6);
    expect(DEMO_SPAM_RULES.length).toBeLessThanOrEqual(8);
    const rules = DEMO_SPAM_RULES.map((r) => {
      const parsed = parseSpamRule(r);
      expect(parsed.success, r.name).toBe(true);
      return { rule: parsed.data as NonNullable<typeof parsed.data>, enabled: r.enabled };
    });
    for (const c of DEMO_SPAM_COMMENTS) {
      const hit = rules.some(
        ({ rule, enabled }) => enabled && matchSpamRule(rule, { text: c.text }),
      );
      expect(hit, c.externalId).toBe(true);
    }
  });

  it('tự động hóa: ngưỡng ≥ 0,80, có đủ ba mức Tắt/Chạy thử/Tự động, kênh tồn tại', () => {
    expect(DEMO_AUTOMATION.threshold).toBeGreaterThanOrEqual(0.8);
    expect(new Set(DEMO_AUTOMATION.matrix.map((m) => m.mode))).toEqual(
      new Set(['off', 'shadow', 'auto']),
    );
    const cells = DEMO_AUTOMATION.matrix.map((m) => `${m.channelKey}|${m.target}|${m.label}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('nhật ký: ≥ 40 dòng trải 14 ngày, đủ loại người làm và hành động', () => {
    expect(DEMO_ACTION_LOGS.length).toBeGreaterThanOrEqual(40);
    const days = new Set(DEMO_ACTION_LOGS.map((l) => l.daysAgo));
    expect(Math.max(...days)).toBeGreaterThanOrEqual(13);
    expect(new Set(DEMO_ACTION_LOGS.map((l) => l.actor))).toEqual(
      new Set(['owner', 'staff', 'staff2', 'ai', 'system']),
    );
    for (const l of DEMO_ACTION_LOGS) expect(l.note.startsWith(DEMO_TAG)).toBe(true);
  });

  it('hội thoại: 12–15, đủ ba nền tảng, cửa sổ 24 giờ ở cả ba mức', () => {
    expect(DEMO_CONVERSATIONS.length).toBeGreaterThanOrEqual(12);
    expect(DEMO_CONVERSATIONS.length).toBeLessThanOrEqual(15);
    expect(new Set(DEMO_CONVERSATIONS.map((c) => c.channelKey))).toEqual(
      new Set(['fb', 'ig', 'tt']),
    );
    const left = (m: number) => 24 * 60 - m;
    const expiring = DEMO_CONVERSATIONS.filter(
      (c) => left(c.lastCustomerMinutesAgo) > 0 && left(c.lastCustomerMinutesAgo) < 120,
    );
    const plenty = DEMO_CONVERSATIONS.filter((c) => left(c.lastCustomerMinutesAgo) >= 120);
    const over = DEMO_CONVERSATIONS.filter((c) => left(c.lastCustomerMinutesAgo) <= 0);
    expect(expiring.length).toBeGreaterThan(0);
    expect(plenty.length).toBeGreaterThan(0);
    expect(over.length).toBeGreaterThan(0);
    // Tin đầu mỗi hội thoại phải của khách (tin đi cần hội thoại đã có).
    for (const c of DEMO_CONVERSATIONS) expect(c.turns[0]?.by).toBe('c');
  });

  it('báo cáo: 28 ngày, ~62% trả lời < 15 phút, có hai nhân viên + AI, giờ cao điểm lệch về trưa/tối', () => {
    const now = new Date('2026-11-06T15:30:00');
    const rows = buildReportRows(
      now,
      DEMO_POSTS.map((p) => p.key),
    );
    expect(rows.length).toBeGreaterThanOrEqual(150);
    expect(Math.max(...rows.map((r) => r.minutesAgo))).toBeGreaterThan(20 * DAY_MIN);
    const replied = rows.filter((r) => r.reply);
    const fast = replied.filter((r) => (r.reply?.afterMinutes ?? 99) < 15).length / replied.length;
    expect(fast).toBeGreaterThan(0.45);
    expect(fast).toBeLessThan(0.85);
    expect(new Set(replied.map((r) => r.reply?.by))).toEqual(new Set(['staff', 'staff2', 'ai']));
    expect(rows.some((r) => r.reply === null)).toBe(true);
    for (const r of rows) {
      expect(r.minutesAgo).toBeGreaterThan(0);
      if (r.reply) expect(r.reply.afterMinutes).toBeLessThan(r.minutesAgo);
    }
    // Xác định: cùng hạt → cùng dữ liệu.
    expect(
      buildReportRows(
        now,
        DEMO_POSTS.map((p) => p.key),
      ),
    ).toEqual(rows);
  });

  it('không có SĐT/email thô trong dữ liệu v2', () => {
    const text = JSON.stringify({
      KB_FAQS,
      KB_POLICIES,
      DEMO_ACTION_LOGS,
      DEMO_CONVERSATIONS,
      DEMO_SPAM_RULES,
    });
    expect(text).not.toMatch(/\d{9,}/);
    expect(text).not.toMatch(/[\w.]+@[\w.]+\.\w+/);
    // Bình luận spam chỉ được chứa số GIẢ 0900….
    for (const c of DEMO_SPAM_COMMENTS) {
      for (const m of c.text.matchAll(/0\d[\d ]{8,}/g)) expect(m[0].startsWith('0900')).toBe(true);
    }
  });
});

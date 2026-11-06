import { COMMENT_STATUSES } from '@flow/db/schema/cf';
import { describe, expect, it } from 'vitest';
import {
  DEMO_CHANNELS,
  DEMO_COMMENTS,
  DEMO_POSTS,
  DEMO_PRODUCTS,
  DEMO_TAG,
  DEMO_WORKSPACE_NAME,
} from './demo-data';

const allStrings = JSON.stringify({ DEMO_CHANNELS, DEMO_COMMENTS, DEMO_POSTS, DEMO_PRODUCTS });

describe('DEV-SEED-DEMO bộ dữ liệu mẫu', () => {
  it('workspace và mọi thực thể có nhãn [MẪU]', () => {
    expect(DEMO_WORKSPACE_NAME).toBe('[MẪU] Demo Shop');
    for (const c of DEMO_CHANNELS) expect(c.name.startsWith(DEMO_TAG)).toBe(true);
    for (const p of DEMO_PRODUCTS) expect(p.name.startsWith(DEMO_TAG)).toBe(true);
    for (const c of DEMO_COMMENTS) expect(c.authorName.startsWith(DEMO_TAG)).toBe(true);
  });

  it('kênh giả: external_id có tiền tố demo, chỉ facebook/instagram', () => {
    expect(new Set(DEMO_CHANNELS.map((c) => c.platform))).toEqual(
      new Set(['facebook', 'instagram']),
    );
    for (const c of DEMO_CHANNELS) expect(c.externalId.startsWith('demo_')).toBe(true);
  });

  it('có ≥ 40 bình luận, id ngoài không trùng, trỏ đúng bài/kênh', () => {
    expect(DEMO_COMMENTS.length).toBeGreaterThanOrEqual(40);
    const ids = DEMO_COMMENTS.map((c) => c.externalId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of DEMO_COMMENTS) {
      expect(
        DEMO_POSTS.some((p) => p.key === c.postKey),
        c.externalId,
      ).toBe(true);
    }
    for (const p of DEMO_POSTS) {
      expect(DEMO_CHANNELS.some((c) => c.key === p.channelKey)).toBe(true);
    }
  });

  it('đủ nhãn, cả hai ngôn ngữ, trạng thái và độ tin cậy hợp lệ', () => {
    const labels = new Set<string>(DEMO_COMMENTS.map((c) => c.label));
    for (const l of ['price', 'size', 'stock', 'complaint', 'phone', 'spam']) {
      expect(labels.has(l), l).toBe(true);
    }
    expect(new Set(DEMO_COMMENTS.map((c) => c.lang))).toEqual(new Set(['vi', 'en']));
    for (const c of DEMO_COMMENTS) {
      expect((COMMENT_STATUSES as readonly string[]).includes(c.status), c.externalId).toBe(true);
      expect(c.labelConfidence).toBeGreaterThanOrEqual(0);
      expect(c.labelConfidence).toBeLessThanOrEqual(1);
    }
  });

  it('không có SĐT/email thô trong dữ liệu mẫu', () => {
    expect(allStrings).not.toMatch(/\d{9,}/);
    expect(allStrings).not.toMatch(/[\w.]+@[\w.]+\.\w+/);
  });

  it('có ≥ 10 bản nháp, độ tin cậy trong 0..1, nháp không bao giờ tự gửi', () => {
    const withDraft = DEMO_COMMENTS.filter((c) => c.draft);
    expect(withDraft.length).toBeGreaterThanOrEqual(10);
    for (const c of withDraft) {
      expect(c.draft?.confidence).toBeGreaterThanOrEqual(0);
      expect(c.draft?.confidence).toBeLessThanOrEqual(1);
      expect(c.draft?.text.length).toBeGreaterThan(0);
      expect(['pending_review', 'needs_human']).toContain(c.status);
    }
  });

  it('số tiền trong bản nháp có trong biến thể sản phẩm', () => {
    const prices = new Set(
      DEMO_PRODUCTS.flatMap((p) => p.variants.map((v) => v.priceVnd.toLocaleString('vi-VN'))),
    );
    for (const c of DEMO_COMMENTS) {
      for (const m of c.draft?.text.matchAll(/(\d{1,3}(?:\.\d{3})+)đ/g) ?? []) {
        expect(prices.has(m[1] as string), `${c.externalId}: ${m[1]}`).toBe(true);
      }
    }
  });

  it('sản phẩm có biến thể, giá/tồn hợp lệ', () => {
    expect(DEMO_PRODUCTS.length).toBeGreaterThanOrEqual(3);
    for (const p of DEMO_PRODUCTS) {
      expect(p.variants.length).toBeGreaterThan(0);
      for (const v of p.variants) {
        expect(v.priceVnd).toBeGreaterThan(0);
        expect(v.stock).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

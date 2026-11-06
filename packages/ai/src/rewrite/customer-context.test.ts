import { unsafeMarkMasked as m } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import {
  MAX_OTHER_POST_QUESTIONS,
  MAX_THREAD_TURNS,
  OTHER_POST_WINDOW_DAYS,
  selectCustomerContext,
  type ThreadTurn,
} from './customer-context';

const NOW = new Date('2026-11-06T10:00:00Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const turn = (i: number, from: ThreadTurn['from'] = 'customer'): ThreadTurn => ({
  from,
  text: m(`lượt ${i}`),
  at: minutesAgo(100 - i),
});
const select = (over: Partial<Parameters<typeof selectCustomerContext>[0]>) =>
  selectCustomerContext({ thread: [], otherPosts: [], currentPostId: 'p0', now: NOW, ...over });

describe('FR-144 selectCustomerContext — chuỗi bình luận', () => {
  it('hằng số theo spec: 5 lượt, 3 câu hỏi, 7 ngày', () => {
    expect([MAX_THREAD_TURNS, MAX_OTHER_POST_QUESTIONS, OTHER_POST_WINDOW_DAYS]).toEqual([5, 3, 7]);
  });

  it('lấy 5 lượt gần nhất theo thời gian, trả về cũ → mới, gồm lượt shop', () => {
    const thread = [1, 2, 3, 4, 5, 6, 7].map((i) => turn(i, i % 2 ? 'customer' : 'shop'));
    const ctx = select({ thread: [...thread].reverse() });
    expect(ctx.turns.map((t) => t.text)).toEqual([
      'lượt 3',
      'lượt 4',
      'lượt 5',
      'lượt 6',
      'lượt 7',
    ]);
    expect(ctx.turns.map((t) => t.from)).toEqual([
      'customer',
      'shop',
      'customer',
      'shop',
      'customer',
    ]);
  });

  it('ít hơn 5 lượt → giữ hết; rỗng → rỗng', () => {
    expect(select({ thread: [turn(1)] }).turns).toHaveLength(1);
    expect(select({}).turns).toEqual([]);
  });

  it('lượt ở tương lai (lệch giờ/dữ liệu xấu) bị loại', () => {
    const future: ThreadTurn = {
      from: 'customer',
      text: m('tương lai'),
      at: new Date(NOW.getTime() + 1000),
    };
    expect(select({ thread: [future] }).turns).toEqual([]);
  });
});

describe('FR-144 selectCustomerContext — bài khác', () => {
  const q = (postId: string, text: string, at: Date) => ({ postId, text: m(text), at });

  it('tối đa 3 câu hỏi gần nhất, kèm mã bài, mới nhất trước', () => {
    const ctx = select({
      otherPosts: [
        q('p1', 'a', daysAgo(5)),
        q('p2', 'b', daysAgo(1)),
        q('p3', 'c', daysAgo(3)),
        q('p4', 'd', daysAgo(2)),
      ],
    });
    expect(ctx.otherQuestions.map((x) => [x.postId, x.text])).toEqual([
      ['p2', 'b'],
      ['p4', 'd'],
      ['p3', 'c'],
    ]);
  });

  it('đúng 7 ngày còn tính; quá 7 ngày bỏ (ca biên)', () => {
    const ctx = select({
      otherPosts: [
        q('p1', 'đúng 7 ngày', daysAgo(7)),
        q('p2', 'quá', new Date(daysAgo(7).getTime() - 1)),
      ],
    });
    expect(ctx.otherQuestions.map((x) => x.text)).toEqual(['đúng 7 ngày']);
  });

  it('bỏ câu hỏi thuộc bài hiện tại và câu ở tương lai', () => {
    const ctx = select({
      otherPosts: [
        q('p0', 'cùng bài', daysAgo(1)),
        q('p1', 'tương lai', new Date(NOW.getTime() + 1)),
      ],
    });
    expect(ctx.otherQuestions).toEqual([]);
  });
});

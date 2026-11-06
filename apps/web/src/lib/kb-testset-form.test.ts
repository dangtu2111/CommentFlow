import { TESTSET_MAX_CASES } from '@flow/ai';
import { describe, expect, it } from 'vitest';
import { KB_TESTSET_MAX_LINES, parseTestSetText } from './kb-testset-form';

describe('FR-054 US-034 parseTestSetText (mỗi dòng: câu hỏi | hành động | từ khóa; từ khóa)', () => {
  it('đọc dòng đủ 3 phần, tách từ khóa bằng dấu chấm phẩy', () => {
    expect(parseTestSetText('ship về HN bao nhiêu | answer | 20.000đ; ngày')).toEqual({
      ok: true,
      cases: [
        {
          question: 'ship về HN bao nhiêu',
          expectAction: 'answer',
          replyIncludes: ['20.000đ', 'ngày'],
        },
      ],
    });
  });
  it('bỏ dòng trống, từ khóa tùy chọn, hành động không phân biệt hoa thường', () => {
    const r = parseTestSetText('\n  a | HANDOFF \r\n\n b | skip | \n');
    expect(r).toEqual({
      ok: true,
      cases: [
        { question: 'a', expectAction: 'handoff', replyIncludes: [] },
        { question: 'b', expectAction: 'skip', replyIncludes: [] },
      ],
    });
  });
  it('thiếu hành động → lỗi kèm số dòng (tính từ 1, kể cả dòng trống)', () => {
    expect(parseTestSetText('ok | answer\n\nthiếu hành động')).toEqual({
      ok: false,
      reason: 'invalid_line',
      line: 3,
    });
  });
  it('hành động lạ / câu hỏi rỗng → invalid_line', () => {
    expect(parseTestSetText('a | hide')).toEqual({ ok: false, reason: 'invalid_line', line: 1 });
    expect(parseTestSetText(' | answer')).toEqual({ ok: false, reason: 'invalid_line', line: 1 });
  });
  it('rỗng / không phải chuỗi → empty', () => {
    expect(parseTestSetText('  \n ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseTestSetText(null)).toEqual({ ok: false, reason: 'empty' });
  });
  it('hằng số phía web khớp giới hạn của lõi (@flow/ai)', () => {
    expect(KB_TESTSET_MAX_LINES).toBe(TESTSET_MAX_CASES);
  });
  it('quá số dòng cho phép → too_many (đúng ngưỡng vẫn được)', () => {
    const line = (i: number) => `câu ${i} | answer`;
    const edge = Array.from({ length: KB_TESTSET_MAX_LINES }, (_, i) => line(i)).join('\n');
    expect(parseTestSetText(edge).ok).toBe(true);
    expect(parseTestSetText(`${edge}\n${line(99)}`)).toEqual({ ok: false, reason: 'too_many' });
  });
  it('từ khóa quá dài hoặc quá nhiều → invalid_line', () => {
    expect(parseTestSetText(`a | answer | ${'x'.repeat(101)}`)).toMatchObject({
      reason: 'invalid_line',
    });
    expect(parseTestSetText('a | answer | 1;2;3;4;5;6')).toMatchObject({ reason: 'invalid_line' });
  });
});

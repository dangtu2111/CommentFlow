import { describe, expect, it } from 'vitest';
import { checkPlan, isApproved } from './plan-gate.mjs';

const plan = (status, body = '') => `# Kế hoạch\n\n${body}\n## Trạng thái duyệt\n\n${status}\n`;

describe('isApproved', () => {
  it('nhận "Đã duyệt" (kể cả in đậm, kèm ghi chú); không nhận "Chờ duyệt" hay thiếu mục', () => {
    expect(isApproved(plan('**Đã duyệt** (chủ dự án, 03/11).'))).toBe(true);
    expect(isApproved(plan('Đã duyệt'))).toBe(true);
    expect(isApproved(plan('**Chờ duyệt.** Chưa sửa code.'))).toBe(false);
    expect(isApproved('# Kế hoạch\n\nkhông có mục trạng thái')).toBe(false);
  });

  it('"Chờ duyệt ... (trước đây Đã duyệt)" vẫn là chưa duyệt', () => {
    expect(isApproved(plan('Chờ duyệt lại (bản trước Đã duyệt)'))).toBe(false);
  });
});

describe('checkPlan', () => {
  it('bản nháp/chờ duyệt: chưa áp cổng, dù còn thẻ', () => {
    expect(checkPlan(plan('Chờ duyệt', 'Câu hỏi: [CẦN LÀM RÕ: dùng OAuth không?]\n'))).toEqual([]);
  });

  it('đã duyệt mà còn thẻ [CẦN LÀM RÕ] → đỏ, báo đúng số lượng', () => {
    const problems = checkPlan(plan('Đã duyệt', '- [CẦN LÀM RÕ: A?]\n- [CẦN LÀM RÕ: B?]\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('còn 2 thẻ');
  });

  it('thẻ nằm trong `inline code` hoặc khối ``` (ví dụ, giải thích) không bị tính', () => {
    const body = 'Dùng thẻ `[CẦN LÀM RÕ: ...]` để đánh dấu.\n\n```\n[CẦN LÀM RÕ: mẫu]\n```\n';
    expect(checkPlan(plan('Đã duyệt', body))).toEqual([]);
  });

  it('thẻ đã trả lời và gỡ (viết lại thành quyết định) → đạt', () => {
    expect(checkPlan(plan('Đã duyệt', 'Quyết định: bỏ OAuth (chủ dự án 03/11).\n'))).toEqual([]);
  });

  it('Checklist plan còn ô chưa tick → đỏ; tick đủ → đạt', () => {
    const open = '## Checklist plan\n\n- [x] a\n- [ ] b\n\n';
    const done = '## Checklist plan\n\n- [x] a\n- [x] b\n\n';
    expect(checkPlan(plan('Đã duyệt', open))[0]).toContain('còn 1 mục chưa tick');
    expect(checkPlan(plan('Đã duyệt', done))).toEqual([]);
  });

  it('có mục Tiêu chí nghiệm thu nhưng rỗng → đỏ; có ít nhất một tiêu chí → đạt', () => {
    expect(checkPlan(plan('Đã duyệt', '## Tiêu chí nghiệm thu\n\n(chưa viết)\n\n'))[0]).toContain(
      'không có tiêu chí nào',
    );
    expect(
      checkPlan(plan('Đã duyệt', '## Tiêu chí nghiệm thu\n\n1. Đăng nhập sai báo lỗi chung\n\n')),
    ).toEqual([]);
  });

  it('plan cũ không có mục mới (Checklist, Tiêu chí) vẫn đạt nếu không còn thẻ', () => {
    expect(checkPlan(plan('**Đã duyệt**'))).toEqual([]);
  });
});

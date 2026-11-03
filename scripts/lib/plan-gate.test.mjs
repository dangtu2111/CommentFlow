import { describe, expect, it } from 'vitest';
import {
  checkBranchPlan,
  checkPlan,
  isApproved,
  planFileFor,
  planRequirement,
} from './plan-gate.mjs';

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

describe('planRequirement — nhánh nào cần plan', () => {
  it('feat/* và chore/* bắt buộc có plan', () => {
    expect(planRequirement('feat/auth-ui')).toBe('required');
    expect(planRequirement('chore/workflow-plan-gates')).toBe('required');
  });

  it('mech/*, ops/*, fix/* được miễn (fix/* nhỏ tạo từ /fix-issues)', () => {
    expect(planRequirement('mech/tach-chuoi-vi-en')).toBe('exempt');
    expect(planRequirement('ops/deploy-staging')).toBe('exempt');
    expect(planRequirement('fix/harden-2')).toBe('exempt');
    expect(planRequirement('fix/issue-42')).toBe('exempt');
  });

  it('main và tiền tố lạ được miễn; tiền tố phải khớp đúng (feature/ không phải feat/)', () => {
    for (const branch of [
      'main',
      'dependabot/npm_and_yarn/x',
      'feature/x',
      'feat',
      'features/x',
      '',
    ]) {
      expect(planRequirement(branch), branch).toBe('exempt');
    }
  });
});

describe('planFileFor', () => {
  it('đổi / thành - theo quy ước của feature.md', () => {
    expect(planFileFor('feat/fr-034')).toBe('feat-fr-034.md');
    expect(planFileFor('chore/a/b')).toBe('chore-a-b.md');
  });
});

describe('checkBranchPlan', () => {
  const base = { branch: 'feat/auth-ui', existingPlans: [], addedPlans: [] };

  it('nhánh feat/* không có plan nào → đỏ, nêu đúng tên file cần có', () => {
    const problems = checkBranchPlan(base);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('docs/plans/feat-auth-ui.md');
    expect(problems[0]).toContain('mech/*, ops/*, fix/*');
  });

  it('plan đang tồn tại → đạt', () => {
    expect(checkBranchPlan({ ...base, existingPlans: ['feat-auth-ui.md'] })).toEqual([]);
  });

  it('plan đã bị xóa lúc kết thúc nhưng từng được thêm trong lịch sử nhánh → đạt', () => {
    expect(checkBranchPlan({ ...base, addedPlans: ['feat-auth-ui.md'] })).toEqual([]);
  });

  it('plan của nhánh KHÁC không tính', () => {
    expect(
      checkBranchPlan({ ...base, existingPlans: ['feat-khac.md'], addedPlans: ['feat-khac.md'] }),
    ).toHaveLength(1);
  });

  it('không đọc được lịch sử (addedPlans = null) → không báo lỗi oan', () => {
    expect(checkBranchPlan({ ...base, addedPlans: null })).toEqual([]);
  });

  it('nhánh miễn (mech/ops/fix/main) không có plan → đạt', () => {
    for (const branch of ['mech/x', 'ops/y', 'fix/z', 'main']) {
      expect(checkBranchPlan({ branch, existingPlans: [], addedPlans: [] }), branch).toEqual([]);
    }
  });
});

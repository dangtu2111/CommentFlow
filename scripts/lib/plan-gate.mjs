// Cổng kiểm kế hoạch (docs/plans/<nhánh>.md): chạy bằng công cụ, không dùng AI (AGENTS.md "Không làm trùng việc").
// Ý tưởng mượn từ Spec-Driven Development: không bắt đầu code khi còn điểm chưa rõ; tiêu chí nghiệm thu kiểm được.

/** Thẻ đánh dấu điều chưa rõ trong plan. Phải được chủ dự án trả lời (và thẻ bị gỡ/viết lại) trước khi duyệt. */
export const OPEN_MARKER = '[CẦN LÀM RÕ';

function stripCode(text) {
  // Bỏ khối ``` ... ``` và đoạn `inline` để ví dụ/giải thích thẻ không bị tính là thẻ thật.
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

function sectionOf(text, heading) {
  const match = new RegExp(`^## ${heading}\\s*$`, 'mi').exec(text);
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Plan đã duyệt: mục "Trạng thái duyệt" có chữ "Đã duyệt" (không phải "Chờ duyệt"). */
export function isApproved(text) {
  const section = sectionOf(text, 'Trạng thái duyệt');
  if (!section) return false;
  const body = section.replace(/[*_`>\s]+/g, ' ').trim();
  return /^Đã duyệt/i.test(body);
}

/** @returns {string[]} danh sách vấn đề (rỗng = đạt) */
export function checkPlan(text) {
  const problems = [];
  if (!isApproved(text)) return problems; // bản nháp/chờ duyệt: chưa áp cổng

  const open = stripCode(text).split(OPEN_MARKER).length - 1;
  if (open > 0) {
    problems.push(
      `còn ${open} thẻ ${OPEN_MARKER}…] chưa được trả lời — trả lời rồi gỡ/viết lại thẻ trước khi duyệt`,
    );
  }

  const checklist = sectionOf(text, 'Checklist plan');
  if (checklist !== null) {
    const unchecked = (checklist.match(/^\s*- \[ \]/gm) ?? []).length;
    if (unchecked > 0) problems.push(`Checklist plan còn ${unchecked} mục chưa tick`);
  }

  const criteria = sectionOf(text, 'Tiêu chí nghiệm thu');
  if (criteria !== null && !/^\s*(?:[-*]|\d+\.)\s+\S/m.test(criteria)) {
    problems.push('mục "Tiêu chí nghiệm thu" không có tiêu chí nào');
  }
  return problems;
}

// ---------- Nhánh nào cần kế hoạch ----------

/** Nhánh BẮT BUỘC có kế hoạch (docs/plans/<nhánh với / → ->.md). */
export const PLAN_REQUIRED_PREFIXES = ['feat/', 'chore/'];
/**
 * Nhánh MIỄN kế hoạch: việc cơ học (`mech/*`), hạ tầng (`ops/*`) và sửa lỗi nhỏ tạo từ `/fix-issues` (`fix/*`).
 * Miễn là không bắt buộc CÓ plan; nếu nhánh vẫn có file plan thì file đó vẫn bị kiểm như mọi plan khác.
 * Mọi tiền tố lạ (main, dependabot/…, v.v.) cũng được miễn — cổng chỉ ép các nhánh làm tính năng.
 */
export const PLAN_EXEMPT_PREFIXES = ['mech/', 'ops/', 'fix/'];

/** @returns {'required' | 'exempt'} */
export function planRequirement(branch) {
  if (PLAN_EXEMPT_PREFIXES.some((prefix) => branch.startsWith(prefix))) return 'exempt';
  return PLAN_REQUIRED_PREFIXES.some((prefix) => branch.startsWith(prefix)) ? 'required' : 'exempt';
}

/** `feat/fr-034` → `feat-fr-034.md` */
export function planFileFor(branch) {
  return `${branch.replace(/\//g, '-')}.md`;
}

/**
 * Nhánh bắt buộc có plan phải CÓ plan của mình: đang tồn tại, hoặc đã từng được thêm trong lịch sử nhánh
 * (plan bị xóa ở commit kết thúc việc — `docs/workflows/finish.md` bước 6 — nên chỉ xét file hiện có là sai).
 * @param {{ branch: string, existingPlans: Iterable<string>, addedPlans: Iterable<string> | null }} input
 *   `addedPlans = null` nghĩa là không đọc được lịch sử (clone nông): chỉ dựa vào file hiện có, không báo lỗi oan.
 * @returns {string[]}
 */
export function checkBranchPlan({ branch, existingPlans, addedPlans }) {
  if (planRequirement(branch) === 'exempt') return [];
  const file = planFileFor(branch);
  if (new Set(existingPlans).has(file)) return [];
  if (addedPlans === null) return []; // không biết lịch sử → không phán
  if (new Set(addedPlans).has(file)) return [];
  return [
    `nhánh ${branch} cần kế hoạch docs/plans/${file} (theo docs/workflows/feature.md); lịch sử nhánh chưa từng thêm file này. Nhánh mech/*, ops/*, fix/* được miễn.`,
  ];
}

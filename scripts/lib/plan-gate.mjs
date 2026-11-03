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

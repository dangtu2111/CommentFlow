// Tên nhánh của task = tiền tố + tên task. PR tìm theo ĐÚNG tên nhánh (headRefName).
// Bài học: dễ gõ lệch "feat/x" và "feat-x" → tìm PR không ra → báo kẹt giả. Thử cả các biến thể.
export function branchFor(prefix, name) {
  return `${prefix}${name}`;
}

export function branchCandidates(prefix, name) {
  const list = [branchFor(prefix, name), branchFor(prefix.replace(/\/$/, '-'), name), name];
  return [...new Set(list)];
}

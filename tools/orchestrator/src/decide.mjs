// Quyết định thuần: merge / sửa / chờ / kẹt / xong. Không I/O.
// view: {state, mergeable}; checks: 'green'|'red'|'pending'|'none'|'stale'|'timeout'
// Chỉ merge khi CI xanh thật (hoặc không có check mà cấu hình cho phép). Dùng để kiểm lại ngay trước khi merge.
export function isSafeToMerge(checks, requireChecks = true) {
  return checks === 'green' || (checks === 'none' && !requireChecks);
}

// frozen: cờ khóa merge (file .orchestrator/merge-freeze) — chặn merge, không chặn sửa/kẹt.
export function decidePr({
  view,
  checks,
  fixes,
  maxFixes,
  repeatedCause,
  requireChecks = true,
  frozen = false,
}) {
  if (view.state === 'MERGED') return { action: 'done' };
  if (view.state === 'CLOSED') return { action: 'stuck', reason: 'PR đã đóng, chưa merge' };
  if (repeatedCause) {
    return { action: 'stuck', reason: 'lặp lại cùng NGUYÊN NHÂN GỐC sau khi sửa' };
  }
  if (view.mergeable === 'CONFLICTING') {
    if (fixes >= maxFixes) return { action: 'stuck', reason: `xung đột còn sau ${fixes} lần sửa` };
    return { action: 'fix', kind: 'conflict' };
  }
  if (checks === 'timeout') return { action: 'stuck', reason: 'CI quá thời gian chờ' };
  if (checks === 'stale') {
    return { action: 'stuck', reason: 'agent sửa xong nhưng không có commit mới' };
  }
  if (checks === 'pending') return { action: 'wait' };
  if (checks === 'red') {
    if (fixes >= maxFixes) return { action: 'stuck', reason: `CI đỏ sau ${fixes} lần sửa` };
    return { action: 'fix', kind: 'ci' };
  }
  if (checks === 'none' && requireChecks) {
    return { action: 'stuck', reason: 'không thấy check CI nào (kiểm tra billing/workflow)' };
  }
  if (view.mergeable === 'UNKNOWN') return { action: 'wait' };
  if (frozen) return { action: 'wait', reason: 'merge-freeze' };
  return { action: 'merge' };
}

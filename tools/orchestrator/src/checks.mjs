// Gom trạng thái CI. Quy tắc: còn check đang chạy thì CHƯA đếm đỏ (pending thắng red).
export function classifyChecks(checks, ignore = []) {
  const list = checks.filter((c) => !ignore.includes(c.name));
  if (list.length === 0) return 'none';
  const buckets = list.map((c) => c.bucket);
  if (buckets.includes('pending')) return 'pending';
  if (buckets.some((b) => b === 'fail' || b === 'cancel')) return 'red';
  return 'green';
}

export function failedCheckNames(checks, ignore = []) {
  return checks
    .filter((c) => !ignore.includes(c.name) && (c.bucket === 'fail' || c.bucket === 'cancel'))
    .map((c) => c.name);
}

// Chờ CI xong thật (không dùng `gh pr checks --watch`: nó trả sớm khi chưa có check → báo kẹt giả).
// sinceSha: sau khi agent push bản sửa, bỏ qua kết quả cũ cho tới khi commit đầu PR đổi.
export async function waitForChecks({ gh, pr, ignore, sinceSha, ci, sleep, now }) {
  const started = now();
  const elapsedSec = () => (now() - started) / 1000;
  const timeoutSec = ci.timeoutMinutes * 60;
  while (elapsedSec() < timeoutSec) {
    if (sinceSha) {
      const view = await gh.prView(pr);
      if (view.headSha === sinceSha) {
        if (elapsedSec() >= ci.noChecksGraceSeconds) return { status: 'stale', checks: [] };
        await sleep(ci.pollSeconds * 1000);
        continue;
      }
    }
    const checks = await gh.prChecks(pr);
    const status = classifyChecks(checks, ignore);
    if (status === 'none') {
      if (elapsedSec() >= ci.noChecksGraceSeconds) return { status: 'none', checks };
    } else if (status !== 'pending') {
      return { status, checks };
    }
    await sleep(ci.pollSeconds * 1000);
  }
  return { status: 'timeout', checks: [] };
}

// Các bước kiểm nhanh trước khi push (docs/workflows/finish.md). Rẻ → đắt, dừng ở lỗi đầu.
export const PRECHECK_STEPS = [
  { script: 'lint' },
  { script: 'format:check' },
  { script: 'typecheck' },
  { script: 'check:migrations' },
  { script: 'check:plans' },
  { script: 'codemap:check' },
  { script: 'quyet:check' },
  { script: 'cbcc:check' },
  { script: 'kt:check' },
];

/** Chạy tuần tự; `run(step)` trả mã thoát. Dừng ngay ở bước lỗi đầu tiên. */
export function runSteps(steps, run) {
  for (const step of steps) {
    if (run(step) !== 0) return { ok: false, failed: step.script };
  }
  return { ok: true, failed: null };
}

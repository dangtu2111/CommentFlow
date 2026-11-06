// Trình điều phối chỉ được chạy một số lệnh git an toàn. Không bao giờ: push, rebase, reset, add, --force.
const ALLOWED = new Set(['fetch', 'checkout', 'worktree', 'rev-parse', 'status']);
const FORBIDDEN_FLAGS = new Set([
  '--force',
  '-f',
  '--force-with-lease',
  '-B',
  '--hard',
  '-A',
  '--all',
]);

export function assertSafeGit(args) {
  const [sub, ...rest] = args;
  if (!ALLOWED.has(sub)) {
    throw new Error(`git ${sub ?? ''}: trình điều phối không được phép chạy lệnh này`);
  }
  const flag = rest.find((a) => FORBIDDEN_FLAGS.has(a));
  if (flag) throw new Error(`git ${sub} ${flag}: cờ bị cấm (không ép, không ghi đè)`);
  return args;
}

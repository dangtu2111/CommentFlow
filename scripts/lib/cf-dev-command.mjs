// Dựng câu lệnh chạy trên máy ảo qua `ssh cf`. CHỈ cho project cf-dev (docs/decisions/002-hai-may.md):
// không có đường nào để chọn project khác, thêm file compose khác, hay xóa volume dữ liệu.

const REMOTE_DIR = '~/CommentFlow';
const COMPOSE =
  'docker compose -p cf-dev --env-file .env.cf-dev -f infra/docker-compose.yml -f infra/docker-compose.dev.yml';

const COMPOSE_SUBCOMMANDS = new Set([
  'up',
  'down',
  'ps',
  'logs',
  'restart',
  'stop',
  'start',
  'build',
  'config',
]);
// Cờ có thể đổi project/file hoặc xóa dữ liệu.
const FORBIDDEN_FLAGS = new Set([
  '-v',
  '--volumes',
  '-p',
  '--project-name',
  '-f',
  '--file',
  '--env-file',
  '--profile',
  '--project-directory',
]);
const SAFE_ARG = /^[A-Za-z0-9_.:=/@-]+$/;
// Không cho bắt đầu bằng '-' để tên nhánh không bị git hiểu thành tùy chọn.
const SAFE_BRANCH = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/;

export class CfDevCommandError extends Error {}

function assertSafeArgs(args) {
  for (const arg of args) {
    if (!SAFE_ARG.test(arg)) throw new CfDevCommandError(`Tham số không hợp lệ: ${arg}`);
    // So khớp cả dạng `--volumes=true` (phần trước dấu = là tên cờ).
    if (FORBIDDEN_FLAGS.has(arg.split('=')[0] ?? arg)) {
      throw new CfDevCommandError(`Cờ bị cấm: ${arg}`);
    }
    // Cờ ngắn viết dính (-pfoo, -fx.yml, -vt1): docker compose hiểu được các cụm này nên chặn mọi cụm
    // chứa v/p/f (xóa volume / đổi project / đổi file).
    if (/^-[A-Za-z]/.test(arg) && /[vpf]/.test(arg.slice(1))) {
      throw new CfDevCommandError(`Cờ bị cấm: ${arg}`);
    }
    if (arg.includes('staging')) throw new CfDevCommandError('Không được nhắc tới cf-staging');
  }
}

/** @param {string[]} argv ví dụ ['up', '-d', 'postgres'] hoặc ['stats'] hoặc ['sync', 'chore/scaffold'] */
export function buildRemoteCommand(argv) {
  const [sub, ...rest] = argv;
  if (!sub) throw new CfDevCommandError('Thiếu lệnh con');

  if (sub === 'stats') {
    return `cd ${REMOTE_DIR} && docker stats --no-stream $(${COMPOSE} ps -q)`;
  }
  if (sub === 'env-init') {
    return `cd ${REMOTE_DIR} && bash scripts/cf-dev-env-init.sh`;
  }
  if (sub === 'add-auth-role') {
    // Thêm role cf_auth vào volume Postgres ĐÃ có (script khởi tạo chỉ chạy lúc volume trống). Chỉ chạy script cố định trong repo.
    if (rest.length > 0) throw new CfDevCommandError('add-auth-role không nhận tham số');
    return `cd ${REMOTE_DIR} && bash infra/scripts/cf-dev-add-auth-role.sh`;
  }
  if (sub === 'sync') {
    const branch = rest[0];
    if (rest.length !== 1 || !branch || !SAFE_BRANCH.test(branch) || branch.includes('staging')) {
      throw new CfDevCommandError('sync cần đúng một tên nhánh hợp lệ');
    }
    return `cd ${REMOTE_DIR} && git fetch origin && git checkout ${branch} -- && git pull --ff-only origin ${branch}`;
  }
  if (!COMPOSE_SUBCOMMANDS.has(sub)) {
    throw new CfDevCommandError(`Lệnh không được phép: ${sub}`);
  }
  assertSafeArgs(rest);
  // `config` in ra giá trị đã thay biến (gồm bí mật) → chỉ cho phép kiểm cú pháp (-q).
  if (sub === 'config' && !rest.some((arg) => arg === '-q' || arg === '--quiet')) {
    throw new CfDevCommandError('config chỉ được chạy với -q (không in giá trị bí mật)');
  }
  return `cd ${REMOTE_DIR} && ${COMPOSE} ${[sub, ...rest].join(' ')}`;
}

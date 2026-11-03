import { AppError } from '@flow/shared';

const MIGRATION_ENVS = ['dev', 'test', 'ci'];
/** Chỉ các DB này được migrate bằng script (staging/production chỉ qua CI có duyệt — docs/15 §6). */
const MIGRATION_DATABASES = ['cf_dev', 'cf_test', 'cf_ci'];
/** Chỉ các DB này được xóa-tạo lại schema. */
const RESET_DATABASES = ['cf_test', 'cf_ci'];
/** DB test của một làn song song (docs/workflows/parallel.md): `cf_test_<làn>`, làn = chữ thường/số, 1–8 ký tự. */
const LANE_TEST_DATABASE = /^cf_test_[a-z0-9]{1,8}$/;

type GuardInput = { appEnv: string | undefined; databaseUrl: string | undefined };

/** Tên database lấy từ phần đường dẫn của URL; không bao giờ đưa mật khẩu vào thông báo lỗi. */
function databaseNameOf(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new AppError('CONFIG_INVALID', 'Thiếu chuỗi kết nối database (DATABASE_ADMIN_URL).');
  }
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  } catch {
    throw new AppError('CONFIG_INVALID', 'Chuỗi kết nối database không đúng định dạng URL.');
  }
}

function assertAllowed(input: GuardInput, allowedDatabases: string[], purpose: string): string {
  if (!input.appEnv || !MIGRATION_ENVS.includes(input.appEnv)) {
    throw new AppError(
      'FORBIDDEN',
      `Từ chối ${purpose}: APP_ENV phải là ${MIGRATION_ENVS.join('/')} (đang là "${input.appEnv ?? ''}").`,
    );
  }
  const name = databaseNameOf(input.databaseUrl);
  if (!allowedDatabases.includes(name) && !LANE_TEST_DATABASE.test(name)) {
    throw new AppError(
      'FORBIDDEN',
      `Từ chối ${purpose}: database "${name}" không nằm trong danh sách cho phép (${allowedDatabases.join(', ')}).`,
    );
  }
  return name;
}

/** Chặn chạy migration nhầm lên staging/production từ máy dev. Trả về tên database. */
export function assertMigrationAllowed(input: GuardInput): string {
  return assertAllowed(input, MIGRATION_DATABASES, 'migration');
}

/** Chỉ cho xóa-tạo lại schema trên DB test. Trả về tên database. */
export function assertTestResetAllowed(input: GuardInput): string {
  return assertAllowed(input, RESET_DATABASES, 'tạo lại schema');
}

/**
 * Có hiện DỮ LIỆU MẪU `[MẪU]` ở trang thật không (UI-first, chỉ DEV). Chỉ bật khi `APP_ENV=dev`; staging,
 * production, test, ci → luôn tắt (hiện "—"/trạng thái trống + "Sắp có"). Số liệu mẫu không bao giờ thành số thật.
 */
export function showSampleData(
  env: { APP_ENV?: string | undefined; NODE_ENV?: string | undefined } = process.env,
): boolean {
  return env.APP_ENV === 'dev';
}

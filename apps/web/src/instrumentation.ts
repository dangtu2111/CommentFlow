/**
 * Chạy một lần khi server Next khởi động (chỉ runtime Node). Ném lỗi ở đây làm web KHÔNG khởi động — dùng cho kiểm
 * cấu hình bắt buộc (TOKEN-KEY-STARTUP-WEB). Cờ kết nối Facebook tắt (mặc định) → không làm gì, không chạm DB.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { loadFbOAuthConfig } = await import('./server/fb-oauth-env');
  const config = loadFbOAuthConfig(); // bật mà thiếu biến → ném (CONFIG_INVALID)
  if (!config.enabled) return;
  const [{ listChannelKeyVersions }, { getDb }, { verifyWebTokenKeysAtStartup }] =
    await Promise.all([
      import('@flow/db/runtime'),
      import('./server/db'),
      import('./server/token-keys-startup'),
    ]);
  await verifyWebTokenKeysAtStartup(config, () =>
    getDb().withSystem((tx) => listChannelKeyVersions(tx)),
  );
}

/** Thời gian chờ giữa hai lần "Kiểm tra toàn bộ kết nối" của cùng workspace (tránh dồn Meta + dồn hàng đợi). */
export const CHECK_COOLDOWN_SECONDS = 60;

/** Đã có kênh nào được kiểm trong khoảng chờ chưa (lấy lần kiểm mới nhất của mọi kênh). */
export function isCheckThrottled(
  channels: ReadonlyArray<{ lastCheckedAt: Date | null }>,
  now: Date,
): boolean {
  const newest = channels.reduce<number>(
    (max, channel) => Math.max(max, channel.lastCheckedAt?.getTime() ?? Number.NEGATIVE_INFINITY),
    Number.NEGATIVE_INFINITY,
  );
  return now.getTime() - newest < CHECK_COOLDOWN_SECONDS * 1000;
}

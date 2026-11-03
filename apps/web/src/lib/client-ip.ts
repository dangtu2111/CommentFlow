const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * IP khách từ `X-Forwarded-For`, CHỈ tin phần tử do proxy tin cậy của ta ghi: với `trustedHops` proxy nối vào
 * cuối danh sách, khách là phần tử thứ `trustedHops` tính từ PHẢI (phần tử đầu do khách tự đặt được → không tin).
 * `trustedHops = 0` (mặc định, không có proxy) hoặc danh sách ngắn hơn số proxy → không biết IP (undefined).
 */
export function clientIpFrom(forwardedFor: string | null, trustedHops: number): string | undefined {
  if (!forwardedFor || trustedHops <= 0) return undefined;
  const parts = forwardedFor
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = parts[parts.length - trustedHops];
  return candidate && IP_PATTERN.test(candidate) ? candidate : undefined;
}

import { AppError } from './errors';

/**
 * CHỐT CHẶN "KHÔNG MOCK KHI CHẠY" (chủ dự án chốt 08/11/2026): bản giả (mock/fixture/demo) chỉ tồn tại cho test tự động — test tự cắm bản giả qua
 * tham số/DI, KHÔNG chọn được bằng biến môi trường; tiến trình KHÔNG phải test mà nạp bản giả → lỗi NGAY (không âm thầm chạy bản giả).
 *
 * Tiến trình test = vitest (`VITEST`) hoặc `NODE_ENV=test`. Công cụ đo EVAL chạy bản fixture (`--backend mock`) phải TỰ khai báo bằng
 * `allowMockInThisProcess` (tham số dòng lệnh, không phải biến môi trường); web/worker không bao giờ gọi hàm đó.
 */
type Env = Record<string, string | undefined>;

let declaredReason: string | null = null;

export function isTestProcess(env: Env = process.env): boolean {
  return env.VITEST !== undefined || env.NODE_ENV === 'test';
}

/** CHỈ cho công cụ đo (EVAL `--backend mock`): khai báo lý do; kết quả chạy kèm nhãn "mock — không phải số đo chất lượng". */
export function allowMockInThisProcess(reason: string): void {
  declaredReason = reason;
}

export function mockAllowedReason(): string | null {
  return declaredReason;
}

/** Gọi ở ĐẦU mọi hàm tạo bản giả: ném lỗi nếu tiến trình không phải test và chưa khai báo. */
export function assertMockAllowed(what: string, env: Env = process.env): void {
  if (isTestProcess(env) || declaredReason !== null) return;
  throw new AppError(
    'INTERNAL',
    `Không được dùng bản giả "${what}" khi ứng dụng chạy: bản giả chỉ dành cho test tự động (cắm qua tham số). Cấu hình dịch vụ thật hoặc tắt tính năng.`,
  );
}

/** Chỉ cho test: xóa khai báo. */
export function resetMockAllowanceForTests(): void {
  declaredReason = null;
}

import { maskPii } from './pii';

/**
 * Sức khỏe tích hợp, hàng đợi và dead letter cho trang Admin (FR-104, US-083, docs/13 §3.2).
 * Lõi thuần: không DB, không mạng. Số liệu do truy vấn tổng hợp (`@flow/db`) cung cấp.
 */

/** Nhà cung cấp ngoài được theo dõi (khớp CHECK của `cf.integration_incidents`, migration 0059). */
export const INTEGRATION_PROVIDERS = [
  'facebook',
  'instagram',
  'tiktok',
  'shopify',
  'google_sheets',
  'haravan',
  'sapo',
  'kiotviet',
  'pancake',
  'llm',
  'smtp',
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type HealthStatus = 'ok' | 'degraded' | 'down';
const SEVERITY: Record<HealthStatus, number> = { ok: 0, degraded: 1, down: 2 };

const worst = (a: HealthStatus, b: HealthStatus): HealthStatus =>
  SEVERITY[a] >= SEVERITY[b] ? a : b;

/** Số lỗi trong cửa sổ từ mức này trở lên → `down`. */
export const PROVIDER_DOWN_ERROR_COUNT = 20;
/** docs/15 §giám sát: `ingest` tồn > 5 phút → cảnh báo. */
export const INGEST_BACKLOG_LIMIT_SECONDS = 300;
/** Hàng đợi khác (send, hide, sync…): ngưỡng rộng hơn vì chấp nhận trễ. */
export const OTHER_QUEUE_BACKLOG_LIMIT_SECONDS = 1800;
export const INCIDENT_MESSAGE_MAX_LENGTH = 300;

/** Chỉ Super Admin xem được dead letter/sức khỏe tích hợp (docs/13 §3.2). Mọi giá trị lạ → từ chối. */
export function canViewIntegrationHealth(user: {
  isAdmin: boolean;
  adminRole: string | null;
}): boolean {
  return user.isAdmin === true && user.adminRole === 'super';
}

const isValidCount = (n: number): boolean => Number.isFinite(n) && n >= 0;

export function evaluateProviderHealth(input: { errorCount: number }): HealthStatus {
  if (!isValidCount(input.errorCount)) return 'down'; // số liệu hỏng: thiên về cảnh báo
  if (input.errorCount >= PROVIDER_DOWN_ERROR_COUNT) return 'down';
  return input.errorCount > 0 ? 'degraded' : 'ok';
}

export type QueueSnapshot = { name: string; oldestWaitingSeconds: number; deadCount: number };

export function evaluateQueueHealth(queue: QueueSnapshot): HealthStatus {
  if (!isValidCount(queue.oldestWaitingSeconds) || !isValidCount(queue.deadCount)) return 'down';
  const limit =
    queue.name === 'ingest' ? INGEST_BACKLOG_LIMIT_SECONDS : OTHER_QUEUE_BACKLOG_LIMIT_SECONDS;
  if (queue.oldestWaitingSeconds > limit) return 'down';
  return queue.deadCount > 0 ? 'degraded' : 'ok';
}

export type IntegrationHealthInput = {
  providerErrors: ReadonlyArray<{ provider: string; errorCount: number }>;
  queues: ReadonlyArray<QueueSnapshot>;
};

export type IntegrationHealthSummary = {
  overall: HealthStatus;
  providers: Array<{ provider: IntegrationProvider; errorCount: number; status: HealthStatus }>;
  queues: Array<QueueSnapshot & { status: HealthStatus }>;
};

export function summarizeIntegrationHealth(
  input: IntegrationHealthInput,
): IntegrationHealthSummary {
  const totals = new Map<string, number>();
  for (const row of input.providerErrors) {
    const previous = totals.get(row.provider) ?? 0;
    // NaN/âm lan truyền để evaluateProviderHealth báo `down`.
    totals.set(row.provider, isValidCount(row.errorCount) ? previous + row.errorCount : Number.NaN);
  }
  const providers = INTEGRATION_PROVIDERS.map((provider) => {
    const errorCount = totals.get(provider) ?? 0;
    return { provider, errorCount, status: evaluateProviderHealth({ errorCount }) };
  });
  const queues = input.queues.map((queue) => ({ ...queue, status: evaluateQueueHealth(queue) }));
  const overall = [...providers, ...queues].reduce<HealthStatus>(
    (acc, item) => worst(acc, item.status),
    'ok',
  );
  return { overall, providers, queues };
}

// Chuỗi dài liền không khoảng trắng (token, khóa, băm) — không bao giờ cần để chẩn đoán.
const LONG_OPAQUE = /[A-Za-z0-9_\-+/=.]{24,}/g;

/** Làm sạch thông báo lỗi trước khi ghi `integration_incidents` (che PII + token, cắt độ dài). */
export function sanitizeIncidentMessage(message: string): string {
  const cleaned = maskPii(message).replace(LONG_OPAQUE, '[ẩn]');
  return cleaned.length > INCIDENT_MESSAGE_MAX_LENGTH
    ? cleaned.slice(0, INCIDENT_MESSAGE_MAX_LENGTH)
    : cleaned;
}

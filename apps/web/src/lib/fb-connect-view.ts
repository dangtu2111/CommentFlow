/**
 * Phần thuần của giao diện Kết nối Facebook (FR-010, CH-RECONNECT-ACTION): thông báo theo `?fb=`, tóm tắt kết quả,
 * và điều kiện hiện nút "Kết nối lại". Không phụ thuộc React/DB để test bằng bảng.
 */
export const FB_NOTICE_KEYS = [
  'done',
  'partial',
  'state',
  'denied',
  'error',
  'limit',
  'none',
  'unavailable',
  'expiredSession',
] as const;
export type FbNoticeKey = (typeof FB_NOTICE_KEYS)[number];

export const FB_START_PATH = '/api/channels/facebook/start';
/** Bắt đầu lại OAuth và xin LẠI quyền còn thiếu (`auth_type=rerequest`). */
/** Tải lại bước chọn Page (phiên chọn còn hiệu lực 10 phút) để lấy danh sách mới từ Meta. */
export const FB_SELECT_PATH = '/app/channels?fb=select';
export const FB_REREQUEST_PATH = `${FB_START_PATH}?rerequest=1`;

/** `?fb=` từ URL → khóa thông báo (giá trị lạ → không hiện gì; `select` là bước chọn Page, không phải thông báo). */
export function fbNoticeOf(value: string | string[] | undefined): FbNoticeKey | null {
  const v = Array.isArray(value) ? value[0] : value;
  return (FB_NOTICE_KEYS as readonly string[]).includes(v ?? '') ? (v as FbNoticeKey) : null;
}

export type ConnectOutcomeLike = { outcome: string };

/** Kết quả nhiều Page → `fb=done` (tất cả ổn) hoặc `fb=partial` (có Page chưa xong) kèm số lượng. */
export function summarizeConnect(results: readonly ConnectOutcomeLike[]): {
  notice: 'done' | 'partial' | 'error';
  connected: number;
  problems: number;
} {
  const connected = results.filter((r) => r.outcome === 'connected').length;
  const problems = results.length - connected;
  if (connected === 0) return { notice: 'error', connected, problems };
  return { notice: problems === 0 ? 'done' : 'partial', connected, problems };
}

export function connectSummaryQuery(results: readonly ConnectOutcomeLike[]): string {
  const { notice, connected, problems } = summarizeConnect(results);
  return `fb=${notice}&ok=${connected}&bad=${problems}`;
}

/** Số trong query (`ok`/`bad`): chỉ chữ số, tối đa 3 chữ số; sai → 0. */
export function countParam(value: string | string[] | undefined): number {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^[0-9]{1,3}$/.test(v) ? Number(v) : 0;
}

/** Hiện "Kết nối lại": chỉ Owner, chỉ khi tính năng bật, và kênh cần kết nối lại hoặc chưa nhận webhook. */
export function canReconnect(input: {
  role: 'owner' | 'staff';
  enabled: boolean;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  webhookSubscribed: boolean;
}): boolean {
  if (input.role !== 'owner' || !input.enabled) return false;
  return input.status !== 'connected' || !input.webhookSubscribed;
}

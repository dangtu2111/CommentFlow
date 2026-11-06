import {
  type AutomationConfig,
  type AutomationRule,
  MATRIX_LABELS,
  MATRIX_TARGETS,
  parseAutomationConfig,
} from '@flow/ai';

/**
 * Trang Cài đặt tự gửi (FR-070/071): phần thuần — đổi dữ liệu form thành `AutomationConfig` (qua schema Zod của
 * `@flow/ai`, nơi giữ mọi giới hạn an toàn) và ngược lại cho giá trị mặc định của form. Không phụ thuộc
 * React/DB để test được.
 *
 * Tên trường ma trận: `mode:<channelId>:<target>:<label>`. Chỉ đọc ô của kênh thuộc workspace (`channelIds`
 * do server dựng từ DB) — kênh lạ trong form bị bỏ, không thể ghi chéo workspace.
 */
export type FormSource = { get(key: string): unknown; getAll(key: string): unknown[] };
export type AutomationFormField =
  | 'rules'
  | 'threshold'
  | 'delaySeconds'
  | 'dailyCap'
  | 'activeHours'
  | 'blockedKeywords'
  | 'signature'
  | 'form';
export type AutomationFormResult =
  | { ok: true; config: AutomationConfig }
  | { ok: false; field: AutomationFormField };

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
/** Ô trống/chữ → NaN (không để `Number('')` thành 0 lọt qua). */
const num = (value: unknown): number => {
  const text = str(value).trim();
  return text === '' ? Number.NaN : Number(text);
};

function readRules(data: FormSource, channelIds: readonly string[]): unknown[] {
  const rules: unknown[] = [];
  for (const channelId of channelIds) {
    for (const target of MATRIX_TARGETS) {
      for (const label of MATRIX_LABELS) {
        const mode = data.get(`mode:${channelId}:${target}:${label}`);
        if (mode === null || mode === undefined || mode === 'off' || mode === '') continue;
        rules.push({ channelId, target, label, mode });
      }
    }
  }
  return rules;
}

function readActiveHours(data: FormSource) {
  if (str(data.get('hoursEnabled')) !== 'on') return null;
  return {
    days: data.getAll('hoursDays').map((d) => num(d)),
    from: str(data.get('hoursFrom')),
    to: str(data.get('hoursTo')),
  };
}

const splitKeywords = (text: string): string[] =>
  text
    .split(/[\r\n,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

export function parseAutomationForm(
  data: FormSource,
  channelIds: readonly string[],
): AutomationFormResult {
  const parsed = parseAutomationConfig({
    rules: readRules(data, channelIds),
    threshold: Math.round(num(data.get('threshold')) * 100) / 10_000,
    delaySeconds: num(data.get('delaySeconds')),
    dailyCap: num(data.get('dailyCap')),
    activeHours: readActiveHours(data),
    blockedKeywords: splitKeywords(str(data.get('blockedKeywords'))),
    signature: str(data.get('signature')),
  });
  if (parsed.success) return { ok: true, config: parsed.data };
  const head = parsed.error.issues[0]?.path[0];
  const known: readonly string[] = [
    'rules',
    'threshold',
    'delaySeconds',
    'dailyCap',
    'activeHours',
    'blockedKeywords',
    'signature',
  ];
  return {
    ok: false,
    field:
      typeof head === 'string' && known.includes(head) ? (head as AutomationFormField) : 'form',
  };
}

export type AutomationFormDefaults = {
  thresholdPercent: string;
  delaySeconds: number;
  dailyCap: number;
  hoursEnabled: boolean;
  hoursDays: number[];
  hoursFrom: string;
  hoursTo: string;
  keywordsText: string;
  signature: string;
  rules: AutomationRule[];
};

/** Giá trị ban đầu của form từ cấu hình đã lưu (khung giờ mặc định 08:00–21:00, thứ Hai–thứ Bảy, khi chưa bật). */
export function automationFormDefaults(config: AutomationConfig): AutomationFormDefaults {
  return {
    thresholdPercent: String(Math.round(config.threshold * 10_000) / 100),
    delaySeconds: config.delaySeconds,
    dailyCap: config.dailyCap,
    hoursEnabled: config.activeHours !== null,
    hoursDays: config.activeHours?.days ?? [1, 2, 3, 4, 5, 6],
    hoursFrom: config.activeHours?.from ?? '08:00',
    hoursTo: config.activeHours?.to ?? '21:00',
    keywordsText: config.blockedKeywords.join('\n'),
    signature: config.signature ?? '',
    rules: config.rules,
  };
}

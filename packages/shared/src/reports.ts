/**
 * Chỉ số báo cáo (FR-083, Q-RPT1). Logic thuần: nhận các dòng bình luận (đã đọc từ DB) + vai trò người xem, trả số liệu
 * và CSV. Không gọi mạng, không gửi gì ra nền tảng (nên không chạm luật cửa sổ 24 giờ/7 ngày của Meta — báo cáo chỉ ĐỌC
 * `replied_at`). Chỉ id người dùng nội bộ, không tên/SĐT/nội dung bình luận (nguyên tắc bất biến #6).
 */

/** Ngưỡng "trả lời nhanh": 15 phút (docs/03 §4). */
export const REPORT_FAST_REPLY_MS = 15 * 60_000;
/** Ước lượng số phút một câu AI tự gửi tiết kiệm cho nhân viên (Q-RPT1). */
export const REPORT_DEFAULT_MINUTES_PER_AUTO_REPLY = 2;
/** Múi giờ mặc định của báo cáo: UTC+7 (giờ Việt Nam). */
export const REPORT_DEFAULT_TZ_OFFSET_MINUTES = 7 * 60;
/** Số giờ cao điểm trả về tối đa. */
export const REPORT_PEAK_HOURS_COUNT = 3;

const HOUR_MS = 3_600_000;
/** Trạng thái không phải việc cần phản hồi (không tính vào số nhận được). */
const NOT_ACTIONABLE_STATUSES = new Set(['spam_suspected', 'skipped']);

export type ReportRole = 'owner' | 'admin' | 'staff';
export type ReportViewer = { role: ReportRole; userId: string };

/** Một dòng đầu vào: khớp cột của `cf.comments` (docs/10 §3.2). */
export type ReportCommentRow = {
  id: string;
  channelId: string;
  createdTime: Date | null;
  repliedAt: Date | null;
  repliedBy: string | null;
  status: string;
  isOwn: boolean;
  deletedAt: Date | null;
};

export type ReportOptions = {
  /** Bao gồm. */
  from: Date;
  /** Không bao gồm. */
  to: Date;
  channelId?: string;
  tzOffsetMinutes?: number;
  minutesPerAutoReply?: number;
};

export type StaffProductivity = {
  userId: string;
  answered: number;
  within15Rate: number | null;
  medianResponseMs: number | null;
};

export type Report = {
  scope: 'workspace' | 'personal';
  from: string;
  to: string;
  received: number;
  answered: number;
  /** Đã trả lời / nhận được; null với Staff (không biết mẫu số cá nhân) hoặc khi chưa nhận gì. */
  answerRate: number | null;
  /** Đã trả lời ≤ 15 phút / đã trả lời có mốc giờ hợp lệ. */
  within15Rate: number | null;
  medianResponseMs: number | null;
  autoReplied: number | null;
  hoursSaved: number | null;
  hourlyDistribution: number[];
  peakHours: number[];
  perStaff: StaffProductivity[];
};

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const middle = sorted.slice(sorted.length % 2 === 1 ? mid : mid - 1, mid + 1);
  return middle.reduce((a, b) => a + b, 0) / middle.length;
}

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/** Dòng đã được xác nhận có mốc giờ nhận (sau `inScope`). */
type TimedRow = ReportCommentRow & { createdTime: Date };
/** Dòng đã trả lời (có `repliedAt`). */
type AnsweredRow = TimedRow & { repliedAt: Date };

/** Thời gian phản hồi hợp lệ (ms) hoặc null (lệch đồng hồ làm âm). */
function responseMs(r: AnsweredRow): number | null {
  const ms = r.repliedAt.getTime() - r.createdTime.getTime();
  return ms >= 0 ? ms : null;
}

function inScope(r: ReportCommentRow, o: ReportOptions): r is TimedRow {
  if (r.isOwn || r.deletedAt || !r.createdTime) return false;
  if (NOT_ACTIONABLE_STATUSES.has(r.status)) return false;
  const t = r.createdTime.getTime();
  if (t < o.from.getTime() || t >= o.to.getTime()) return false;
  return o.channelId === undefined || r.channelId === o.channelId;
}

function responseStats(rows: readonly AnsweredRow[]) {
  const times = rows.map(responseMs).filter((x): x is number => x !== null);
  return {
    within15Rate: ratio(times.filter((ms) => ms <= REPORT_FAST_REPLY_MS).length, times.length),
    medianResponseMs: median(times),
  };
}

function hourlyDistribution(createdMs: readonly number[], tzOffsetMinutes: number): number[] {
  const hours = createdMs.map(
    (ms) => ((Math.floor((ms + tzOffsetMinutes * 60_000) / HOUR_MS) % 24) + 24) % 24,
  );
  return Array.from({ length: 24 }, (_, h) => hours.filter((x) => x === h).length);
}

function peakHours(buckets: readonly number[]): number[] {
  return buckets
    .map((count, hour) => ({ count, hour }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count || a.hour - b.hour)
    .slice(0, REPORT_PEAK_HOURS_COUNT)
    .map((b) => b.hour);
}

function staffProductivity(answered: readonly AnsweredRow[]): StaffProductivity[] {
  const byUser = new Map<string, AnsweredRow[]>();
  for (const r of answered) {
    if (!r.repliedBy) continue;
    byUser.set(r.repliedBy, [...(byUser.get(r.repliedBy) ?? []), r]);
  }
  return [...byUser.entries()]
    .map(([userId, rs]) => ({ userId, answered: rs.length, ...responseStats(rs) }))
    .sort((a, b) => b.answered - a.answered || a.userId.localeCompare(b.userId));
}

/**
 * Dựng báo cáo. Staff chỉ nhận chỉ số cá nhân: phạm vi thu hẹp về bình luận do chính họ trả lời TRƯỚC khi tính,
 * nên không có đường nào rò số của người khác; giờ tiết kiệm của AI và tỷ lệ trả lời toàn workspace là null.
 */
export function buildReport(
  rows: readonly ReportCommentRow[],
  viewer: ReportViewer,
  options: ReportOptions,
): Report {
  const personal = viewer.role === 'staff';
  const minutesPerAuto = options.minutesPerAutoReply ?? REPORT_DEFAULT_MINUTES_PER_AUTO_REPLY;
  const tz = options.tzOffsetMinutes ?? REPORT_DEFAULT_TZ_OFFSET_MINUTES;

  const eligible = rows.filter((r): r is TimedRow => inScope(r, options));
  const scoped = personal ? eligible.filter((r) => r.repliedBy === viewer.userId) : eligible;
  const answered = scoped.filter((r): r is AnsweredRow => r.repliedAt !== null);
  const autoReplied = personal
    ? null
    : scoped.filter((r) => r.status === 'auto_replied' && r.repliedAt !== null).length;
  const buckets = hourlyDistribution(
    scoped.map((r) => r.createdTime.getTime()),
    tz,
  );

  return {
    scope: personal ? 'personal' : 'workspace',
    from: options.from.toISOString(),
    to: options.to.toISOString(),
    received: scoped.length,
    answered: answered.length,
    answerRate: personal ? null : ratio(answered.length, scoped.length),
    ...responseStats(answered),
    autoReplied,
    hoursSaved: autoReplied === null ? null : (autoReplied * minutesPerAuto) / 60,
    hourlyDistribution: buckets,
    peakHours: peakHours(buckets),
    perStaff: staffProductivity(answered),
  };
}

/** Một ô CSV (RFC 4180) + chống chèn công thức bảng tính: ô chữ bắt đầu bằng `= + - @ TAB CR` được thêm `'`. */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const rate4 = (x: number | null): number | null => (x === null ? null : Number(x.toFixed(4)));

/** CSV ba cột `section,key,value`, thứ tự cố định; số null → ô rỗng. */
export function reportToCsv(report: Report): string {
  const rows: Array<[string, string, string | number | null]> = [
    ['summary', 'scope', report.scope],
    ['summary', 'from', report.from],
    ['summary', 'to', report.to],
    ['summary', 'received', report.received],
    ['summary', 'answered', report.answered],
    ['summary', 'answer_rate', rate4(report.answerRate)],
    ['summary', 'within_15min_rate', rate4(report.within15Rate)],
    ['summary', 'median_response_ms', report.medianResponseMs],
    ['summary', 'auto_replied', report.autoReplied],
    ['summary', 'hours_saved', rate4(report.hoursSaved)],
    ...report.hourlyDistribution.map((n, h): [string, string, number] => [
      'hourly',
      String(h).padStart(2, '0'),
      n,
    ]),
  ];
  for (const s of report.perStaff) {
    rows.push(
      ['staff', `${s.userId}.answered`, s.answered],
      ['staff', `${s.userId}.within_15min_rate`, rate4(s.within15Rate)],
      ['staff', `${s.userId}.median_response_ms`, s.medianResponseMs],
    );
  }
  const lines = rows.map(([a, b, c]) => [a, b, c].map(csvCell).join(','));
  return `${['section', 'key', 'value'].join(',')}\n${lines.join('\n')}\n`;
}

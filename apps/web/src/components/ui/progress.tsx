export type ProgressTone = 'primary' | 'warm';
export type ProgressSegment = { percent: number; tone?: ProgressTone };

const clamp = (n: number): number => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);

/**
 * Thanh tiến độ một hoặc nhiều đoạn (đã dùng/hạn mức; khớp thật/cần kiểm tra). `label` bắt buộc cho trình đọc
 * màn hình. Giá trị ngoài 0–100 bị cắt về khoảng hợp lệ.
 */
export function Progress({
  label,
  segments,
  thin = false,
}: {
  label: string;
  segments: readonly ProgressSegment[];
  /** Thanh mảnh 6px (hạn mức); mặc định 8px. */
  thin?: boolean;
}) {
  const total = clamp(segments.reduce((sum, s) => sum + clamp(s.percent), 0));
  return (
    <div
      className={thin ? 'progress is-thin' : 'progress'}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(total)}
    >
      {segments.map((s, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: đoạn không có id, thứ tự cố định
          key={i}
          className={`progress-bar progress-${s.tone ?? 'primary'}`}
          style={{ width: `${clamp(s.percent)}%` }}
        />
      ))}
    </div>
  );
}

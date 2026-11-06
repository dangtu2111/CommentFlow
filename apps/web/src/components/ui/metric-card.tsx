import type { ReactNode } from 'react';

export type MetricTone = 'primary' | 'warm' | 'neutral' | 'danger' | 'accent';

/**
 * Thẻ số liệu có ô biểu tượng (Tự động hóa, Quy tắc spam). `value` null = chưa có dữ liệu thật → hiện "—".
 * `sample` gắn nhãn [MẪU] (chỉ dùng ở bản dev): số liệu mẫu không bao giờ hiện như số thật.
 */
export function MetricCard({
  label,
  value,
  unit,
  note,
  noteTone = 'neutral',
  icon,
  iconTone = 'primary',
  sample = false,
  sampleLabel = '[MẪU]',
  large = false,
}: {
  /** Số lớn 30px (thẻ chỉ số chính ở Tự động hóa); mặc định 18px. */
  large?: boolean;
  label: string;
  value: ReactNode | null;
  unit?: string;
  note?: ReactNode;
  noteTone?: MetricTone;
  icon: ReactNode;
  iconTone?: MetricTone;
  sample?: boolean;
  sampleLabel?: string;
}) {
  return (
    <div className={large ? 'metric-card is-large' : 'metric-card'}>
      <div className="metric-card-body">
        <p className="metric-card-label">{label}</p>
        <p className="metric-card-value">
          {value ?? '—'}
          {unit ? <span className="metric-card-unit"> {unit}</span> : null}
          {sample ? <span className="metric-card-sample">{sampleLabel}</span> : null}
        </p>
        {note ? <p className={`metric-card-note is-${noteTone}`}>{note}</p> : null}
      </div>
      <span className={`metric-card-icon is-${iconTone}`} aria-hidden="true">
        {icon}
      </span>
    </div>
  );
}

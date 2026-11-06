import type { ReactNode } from 'react';

/** Ô số liệu/thông tin: nhãn nhỏ + giá trị + ghi chú tùy chọn (`ok` = ghi chú tích cực). */
export function Stat({
  label,
  value,
  note,
  noteOk = false,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  noteOk?: boolean;
}) {
  return (
    <div className="info-tile">
      <p className="info-tile-label">{label}</p>
      <p className="info-tile-value">{value}</p>
      {note ? <p className={`info-tile-note${noteOk ? ' is-ok' : ''}`}>{note}</p> : null}
    </div>
  );
}

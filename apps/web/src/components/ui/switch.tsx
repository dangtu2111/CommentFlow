import type { InputHTMLAttributes, ReactNode } from 'react';

/**
 * Công tắc bật/tắt (vẽ lại ô checkbox thật nên gửi được qua form không cần JS).
 * `disabled` = chức năng chưa có ("Sắp có"): hiện đúng thiết kế nhưng không bấm được và không gửi giá trị.
 */
export function Switch({
  label,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: ReactNode }) {
  return (
    <label
      className={['switch', rest.disabled ? 'is-disabled' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <input
        type="checkbox"
        className="switch-input"
        aria-disabled={rest.disabled || undefined}
        {...rest}
      />
      <span className="switch-track" aria-hidden="true" />
      {label ? <span className="switch-label">{label}</span> : null}
    </label>
  );
}

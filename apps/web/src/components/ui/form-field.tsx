import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/** Thuộc tính cần rải vào ô nhập để nhãn, gợi ý và lỗi được liên kết (a11y). */
export type FieldControlProps = {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
};

/** Id của phần mô tả đi kèm ô nhập: lỗi ưu tiên hơn gợi ý; không có cả hai thì không gắn. */
export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

/**
 * Khung một trường nhập: nhãn (+ liên kết phụ cùng hàng), ô nhập do `children` dựng, gợi ý hoặc lỗi.
 * `children` nhận `control` để rải vào `<input>`/`<select>`/`<textarea>`.
 */
export function FormField({
  id,
  label,
  aux,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  /** Liên kết phụ cùng hàng với nhãn (ví dụ "Quên mật khẩu?"). */
  aux?: ReactNode;
  hint?: string;
  error?: string;
  children: (control: FieldControlProps) => ReactNode;
}) {
  const control: FieldControlProps = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(id, hint, error),
  };
  return (
    <div className="field">
      <div className="field-label-row">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {aux ? <span className="field-aux">{aux}</span> : null}
      </div>
      {children(control)}
      {hint && !error ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

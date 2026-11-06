import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';

export type StepState = 'done' | 'current' | 'todo';

export type StepItem = {
  key: string;
  state: StepState;
  title: string;
  /** Dòng nhỏ phía trên tiêu đề ("Bước 2"). */
  eyebrow?: string;
  /** Dòng trạng thái phía dưới tiêu đề ("Chưa bắt đầu"). */
  caption?: string;
};

/**
 * Thanh các bước: danh sách có thứ tự; bước đã qua có dấu tích, bước hiện tại nổi bật và gắn `aria-current="step"`.
 * `progress` (0–100) hiện thêm thanh tiến độ bên dưới. Số cột: 1 trên mobile, tối đa 3 từ 600px, đủ `steps.length` từ 900px.
 */
export function Stepper({
  steps,
  label,
  progress,
}: {
  steps: readonly StepItem[];
  label: string;
  progress?: number;
}) {
  const style = {
    '--stepper-cols': steps.length,
    '--stepper-cols-md': Math.min(steps.length, 3),
  } as CSSProperties;
  return (
    <div className="stepper">
      <ol className="stepper-list" style={style} aria-label={label}>
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`stepper-step stepper-${step.state}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className="stepper-badge" aria-hidden="true">
              {step.state === 'done' ? <Check size={16} /> : index + 1}
            </span>
            <span className="stepper-text">
              {step.eyebrow ? <span className="stepper-eyebrow">{step.eyebrow}</span> : null}
              <span className="stepper-title">{step.title}</span>
              {step.caption ? <span className="stepper-caption">{step.caption}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {progress === undefined ? null : (
        <div className="stepper-bar" aria-hidden="true">
          <div className="stepper-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

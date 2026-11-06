import type { SuggestionUi } from '../../lib/suggestion';

export type SuggestionLabels = {
  title: string;
  use: string;
  edited: string;
  needsHuman: string;
  sources: string;
  /** Nhãn chip khi chưa biết tên nguồn. */
  sourceFallback: string;
  /** Có `{count}` (được thay ở đây). */
  more: string;
};

/** Ô "Gợi ý của AI" (FR-043): chỉ hiển thị; AI chỉ soạn câu, người bấm gửi. Văn bản thuần (React tự thoát HTML). */
export function SuggestionPanel({
  text,
  ui,
  labels,
  onUse,
}: {
  text: string;
  ui: Extract<SuggestionUi, { show: true }>;
  labels: SuggestionLabels;
  onUse: () => void;
}) {
  const moreText = labels.more.replace('{count}', String(ui.sources.more));
  return (
    <section className="suggestion" aria-label={labels.title}>
      <p className="suggestion-title">{labels.title}</p>
      <blockquote className="suggestion-text">{text}</blockquote>
      {ui.needsHuman ? <p className="suggestion-warn">{labels.needsHuman}</p> : null}
      {ui.sources.chips.length > 0 ? (
        <ul className="suggestion-sources" aria-label={labels.sources}>
          {ui.sources.chips.map((chip) => (
            <li key={chip.id} className="chip">
              {chip.label ?? labels.sourceFallback}
            </li>
          ))}
          {ui.sources.more > 0 ? <li className="chip">{moreText}</li> : null}
        </ul>
      ) : null}
      <div className="suggestion-actions">
        <button type="button" className="btn" onClick={onUse} disabled={!ui.canUse}>
          {labels.use}
        </button>
        {ui.edited ? (
          <span className="suggestion-edited" role="status">
            {labels.edited}
          </span>
        ) : null}
      </div>
    </section>
  );
}

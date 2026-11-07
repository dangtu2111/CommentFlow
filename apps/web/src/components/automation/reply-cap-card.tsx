import { getTranslations } from 'next-intl/server';
import { FIELD_CLASS } from '../ui/tw-form';
import { Panel } from '../ui/tw-parts';

/**
 * Thẻ "Giới hạn câu trả lời AI cho mỗi khách" (FR-167, Q-POR14): Owner chọn 1–5 (mặc định 3). Là form riêng, KHÔNG đụng ma trận tự gửi
 * hay các cột khác của cài đặt. `action` là Server Action của trang (Owner-only, kiểm lại ở máy chủ và ở DB).
 */
export async function ReplyCapCard({
  value,
  min,
  max,
  action,
}: {
  value: number;
  min: number;
  max: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const t = await getTranslations('automation');
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <Panel size="lg" id="reply-cap">
      <form action={action} className="space-y-space-md">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            {t('replyCap.title')}
          </h2>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {t('replyCap.body')}
          </p>
        </div>
        <label
          htmlFor="max-ai-replies"
          className="block font-label-md text-label-md text-on-surface"
        >
          {t('replyCap.label')}
        </label>
        <select
          id="max-ai-replies"
          name="maxAiReplies"
          defaultValue={String(value)}
          className={FIELD_CLASS}
          aria-describedby="max-ai-replies-hint"
        >
          {options.map((n) => (
            <option key={n} value={n}>
              {t('replyCap.option', { count: n })}
            </option>
          ))}
        </select>
        <p id="max-ai-replies-hint" className="font-body-sm text-body-sm text-on-surface-variant">
          {t('replyCap.hint', { count: value })}
        </p>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary/90"
        >
          {t('replyCap.save')}
        </button>
      </form>
    </Panel>
  );
}

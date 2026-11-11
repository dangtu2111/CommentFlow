import Link from 'next/link';
import type { ReactNode } from 'react';
import { useId } from 'react';
import { Icon, type IconName } from '../ui/icon';

/**
 * Hỏi – đáp (FAQ): thành phần trình bày dựng bằng Tailwind, class chép từ `design/stitch/kb-faq.html` (ADR 013). Chỉ dữ liệu THẬT (câu hỏi, câu trả lời, ngôn ngữ, thẻ,
 * số câu, số nháp chờ duyệt). Phần thiết kế chưa có nền tảng (biến thể câu hỏi, lượt trích dẫn, độ hài lòng, đồng bộ web, nhập Excel/CSV, AI sinh biến thể, sandbox)
 * hiện dạng nút/khối TẮT kèm chú thích — không số mẫu.
 */
const LABEL = 'block font-title-sm text-title-sm text-on-surface mb-1';
const INPUT =
  'w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest focus:shadow-md transition-all';
const AREA =
  'w-full p-space-md rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest focus:shadow-md transition-all resize-y';
const BTN_SOFT =
  'flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface font-title-sm text-title-sm shadow-sm';
const OFF = 'cursor-not-allowed opacity-60';

export function FaqField({
  label,
  name,
  defaultValue,
  hint,
  rows,
  required,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  hint?: string;
  rows?: number;
  required?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  const common = {
    id,
    name,
    required,
    maxLength,
    defaultValue: defaultValue ?? '',
    className: rows ? AREA : INPUT,
    'aria-describedby': hint ? `${id}-hint` : undefined,
  };
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {rows ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FaqStat({
  icon,
  value,
  label,
  caption,
}: {
  icon: IconName;
  value: string;
  label: string;
  caption: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center gap-space-md">
      <div className="w-10 h-10 rounded-lg bg-primary-fixed text-primary flex items-center justify-center shrink-0">
        <Icon name={icon} size={18} />
      </div>
      <div>
        <div className="font-title-sm text-title-sm text-on-surface">
          {value} {label}
        </div>
        <div className="font-label-sm text-label-sm text-on-surface-variant">{caption}</div>
      </div>
    </div>
  );
}

/** Hộp tìm kiếm + dải chip theo thẻ (GET, không cần JS) + nút tắt/chính của thanh công cụ. */
export function FaqToolbar({
  q,
  tag,
  tags,
  total,
  labels,
}: {
  q: string;
  tag: string;
  tags: ReadonlyArray<{ tag: string; count: number }>;
  total: number;
  labels: {
    search: string;
    searchSubmit: string;
    all: string;
    soon: string;
    syncWeb: string;
    importFile: string;
    aiVariants: string;
    add: string;
  };
}) {
  const chip = (active: boolean) =>
    active
      ? 'px-3 py-1.5 rounded-full bg-primary-container text-on-primary font-title-sm text-title-sm flex items-center gap-2'
      : 'px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-body-md text-body-md flex items-center gap-2';
  const href = (nextTag: string) =>
    `/app/kb/faq${nextTag || q ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(nextTag ? { tag: nextTag } : {}) }).toString()}` : ''}`;
  return (
    <div className="space-y-space-md">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <form method="get" action="/app/kb/faq" className="relative w-full lg:max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            <Icon name="search" size={18} />
          </span>
          {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={labels.search}
            aria-label={labels.search}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant font-body-md text-body-md shadow-sm outline-none focus:shadow-md"
          />
          <button type="submit" className="sr-only">
            {labels.searchSubmit}
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${BTN_SOFT} ${OFF}`} aria-disabled="true" title={labels.soon}>
            <span className="text-primary">
              <Icon name="sync" size={16} />
            </span>
            {labels.syncWeb}
          </span>
          <span className={`${BTN_SOFT} ${OFF}`} aria-disabled="true" title={labels.soon}>
            <Icon name="upload" size={16} />
            {labels.importFile}
          </span>
          <span
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-title-sm text-title-sm ${OFF}`}
            aria-disabled="true"
            title={labels.soon}
          >
            <span className="text-secondary">
              <Icon name="auto_fix_high" size={16} />
            </span>
            {labels.aiVariants}
          </span>
          <Link
            href="#faq-new"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-container text-on-primary hover:bg-primary font-title-sm text-title-sm shadow-md transition-all"
          >
            <Icon name="add" size={16} />
            {labels.add}
          </Link>
        </div>
      </div>
      <nav
        aria-label={labels.all}
        className="flex flex-wrap items-center gap-2 bg-surface-container-low p-1.5 rounded-xl"
      >
        <Link
          href={href('')}
          className={chip(tag === '')}
          aria-current={tag === '' ? 'page' : undefined}
        >
          <span>{labels.all}</span>
          <span className="px-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">
            {total}
          </span>
        </Link>
        {tags.map((item) => (
          <Link
            key={item.tag}
            href={href(item.tag)}
            className={chip(tag === item.tag)}
            aria-current={tag === item.tag ? 'page' : undefined}
          >
            <span>{item.tag}</span>
            <span className="font-label-sm text-label-sm opacity-80">{item.count}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Thẻ một cặp hỏi–đáp: thanh trên (thẻ, ngôn ngữ), nội dung (form sửa) và chân (lưu/xóa) — `children` là các ô nhập và nút. */
export function FaqCard({
  id,
  chips,
  trailing,
  title,
  children,
  footer,
}: {
  id: string;
  chips: ReactNode;
  trailing?: ReactNode;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex flex-wrap items-center gap-2">{chips}</div>
        {trailing}
      </div>
      <h3
        id={`${id}-title`}
        className="font-headline-sm text-headline-sm text-on-surface font-semibold"
      >
        {title}
      </h3>
      {children}
      {footer}
    </section>
  );
}

export const FAQ_CHIP =
  'px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold';
export const FAQ_ID =
  'px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant font-code-sm text-code-sm';

/** Khối TẮT "biến thể câu hỏi" (chưa có nền tảng lưu) kèm chú thích. */
export function FaqOffVariants({ title, note }: { title: string; note: string }) {
  return (
    <div className="p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between gap-space-sm">
      <span className="flex items-center gap-1.5 font-title-sm text-title-sm text-on-surface-variant">
        <span className="text-secondary">
          <Icon name="forum" size={14} />
        </span>
        {title}
      </span>
      <span className="font-label-sm text-label-sm text-on-surface-variant">{note}</span>
    </div>
  );
}

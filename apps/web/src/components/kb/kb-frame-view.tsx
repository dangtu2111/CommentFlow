import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '../ui/icon';
import { Pill } from '../ui/pill';
import { type RailGroup, type RailItem, RailNav } from '../ui/rail-nav';
import './kb-frame.css';

/** Thanh tiến độ "Độ đầy đủ": chỉ truyền khi có số THẬT (hoặc mẫu ở route dev). */
export type KbCompletenessView = {
  label: string;
  score: number;
  aria: string;
  hint: string;
  detailLabel: string;
  detailHref: string;
};

export type KbFrameViewProps = {
  title: string;
  /** Huy hiệu phiên bản/trạng thái bản nháp: chỉ có ở route dev (mẫu) cho tới khi có dữ liệu thật. */
  versionBadge?: string;
  draftNote?: string;
  scope: { label: string; value: string };
  diff: { label: string; count?: string };
  test: { label: string; href: string };
  publish: { label: string; href: string };
  /** Chữ chú thích cho nút chưa có chức năng ("Sắp có"). */
  soon: string;
  completeness?: KbCompletenessView;
  rail: { label: string; lead?: RailItem; groups: readonly RailGroup[] };
  children: ReactNode;
};

const BOX = 'box' as const;
/** Mốc cho công cụ đo hình học (`pnpm ui:fidelity`): nút chính của thanh lệnh. */
const PRIMARY_LANDMARK = 'primary-button';
const softButton =
  'flex h-10 items-center gap-1.5 rounded-lg bg-surface-container px-3 py-2 font-title-sm text-title-sm text-on-surface shadow-sm transition-colors hover:bg-surface-container-high';
const disabledButton = `${softButton} cursor-not-allowed opacity-60`;

function CommandBar({
  title,
  versionBadge,
  draftNote,
  scope,
  diff,
  test,
  publish,
  soon,
}: Omit<KbFrameViewProps, 'completeness' | 'rail' | 'children'>) {
  return (
    <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
      <div className="flex flex-wrap items-center gap-space-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-headline-sm text-headline-sm text-on-surface">{title}</span>
            {versionBadge ? <Pill tone="accent">{versionBadge}</Pill> : null}
          </div>
          {draftNote ? (
            <div className="mt-0.5 flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-tertiary-container" />
              <span className="font-label-md text-label-md text-on-surface-variant">
                {draftNote}
              </span>
            </div>
          ) : null}
        </div>
        <div className="hidden h-8 w-px bg-surface-container-highest sm:block" />
        <div
          className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-3 py-1.5 text-on-surface"
          aria-disabled="true"
          title={soon}
        >
          <span className="text-primary">
            <Icon name="hub" size={16} />
          </span>
          <span className="font-title-sm text-title-sm">{scope.label}</span>
          <span className="font-title-sm text-title-sm font-semibold text-primary">
            {scope.value}
          </span>
          <span className="text-on-surface-variant">
            <Icon name="arrow_drop_down" size={14} />
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={disabledButton} aria-disabled="true" title={soon}>
          <Icon name="difference" size={16} />
          <span>{diff.label}</span>
          {diff.count ? (
            <Pill tone="warn" shape={BOX}>
              {diff.count}
            </Pill>
          ) : null}
        </span>
        <Link href={test.href} className={softButton}>
          <span className="text-secondary">
            <Icon name="flaky" size={16} />
          </span>
          <span>{test.label}</span>
        </Link>
        <Link
          href={publish.href}
          data-landmark={PRIMARY_LANDMARK}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-primary-container px-4 py-2 font-title-sm text-title-sm text-on-primary shadow-md transition-all hover:bg-primary"
        >
          <Icon name="rocket_launch" size={16} />
          <span>{publish.label}</span>
        </Link>
      </div>
    </div>
  );
}

function CompletenessBar({ completeness }: { completeness: KbCompletenessView }) {
  return (
    <div className="mt-space-md flex flex-col justify-between gap-space-sm rounded-lg bg-surface-container-low p-2.5 pt-space-xs md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex shrink-0 items-center gap-1 text-primary">
          <Icon name="verified" size={18} />
          <span className="font-title-sm text-title-sm">
            {completeness.label}:{' '}
            <strong className="font-bold text-on-surface">{completeness.score}%</strong>
          </span>
        </div>
        <div
          className="hidden h-2 w-48 shrink-0 overflow-hidden rounded-full bg-surface-container-highest sm:block"
          role="progressbar"
          aria-label={completeness.aria}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completeness.score}
        >
          <div
            className="h-full rounded-full bg-primary-container transition-all duration-500"
            style={{ width: `${completeness.score}%` }}
          />
        </div>
        <span className="flex items-center gap-1 truncate font-body-sm text-body-sm text-on-surface-variant">
          <span className="text-tertiary">
            <Icon name="lightbulb" size={14} />
          </span>
          {completeness.hint}
        </span>
      </div>
      <Link
        href={completeness.detailHref}
        className="shrink-0 font-label-sm text-label-sm font-semibold text-primary underline hover:text-on-primary-fixed-variant"
      >
        {completeness.detailLabel}
      </Link>
    </div>
  );
}

/**
 * Khung trang Cơ sở kiến thức (design/stitch/knowledge-base.html) — trình bày thuần, chạy được ở route thật lẫn
 * `/dev/ui/kb`. Nút chưa có chức năng vẫn hiện nhưng `aria-disabled` + chú thích "Sắp có". Thanh lệnh và rail là
 * hai đảo `.tw`; ô nội dung nằm ngoài `.tw` (xem `kb-frame.css`).
 */
export function KbFrameView(props: KbFrameViewProps) {
  const { completeness, rail, children, ...bar } = props;
  return (
    <div className="kb-shell">
      <div className="tw">
        <div className="bg-surface-container-lowest px-space-xl py-space-md shadow-sm">
          <CommandBar {...bar} />
          {completeness ? <CompletenessBar completeness={completeness} /> : null}
        </div>
      </div>
      <div className="kb-split">
        <div className="tw kb-rail">
          <RailNav
            label={rail.label}
            groups={rail.groups}
            {...(rail.lead ? { lead: rail.lead } : {})}
          />
        </div>
        <div className="kb-slot">{children}</div>
      </div>
    </div>
  );
}

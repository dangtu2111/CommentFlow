'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  hideCommentsAction,
  relabelCommentsAction,
  skipCommentsAction,
} from '../../app/app/(guarded)/comments/actions';
import { resolveBulkShortcut } from '../../lib/bulk-shortcuts';
import type { BulkResult } from '../../server/bulk-action';

/** Chuỗi đã dịch từ server (mẫu có `{count}`/`{max}` được thay ở client vì số chỉ biết sau khi chạy). */
export type BulkLabels = {
  select: string;
  toolbar: string;
  selected: string;
  clear: string;
  skip: string;
  hide: string;
  relabel: string;
  labelPick: string;
  apply: string;
  working: string;
  shortcuts: string;
  confirmTitle: string;
  confirmBody: string;
  confirmYes: string;
  confirmNo: string;
  result: string;
  reasons: Record<string, string>;
  rejections: Record<string, string>;
};

type Ctx = {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  labels: BulkLabels;
};

const BulkContext = createContext<Ctx | null>(null);

const fill = (template: string, values: Record<string, number | string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) &&
  !(target instanceof HTMLInputElement && target.type === 'checkbox');

/** Trạng thái chọn nhiều + thanh hành động + phím tắt (FR-045). Bọc quanh danh sách bình luận. */
export function BulkProvider({
  ids,
  max,
  labelOptions,
  labels,
  children,
}: {
  ids: string[];
  max: number;
  labelOptions: Array<{ value: string; text: string }>;
  labels: BulkLabels;
  children: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [pending, startTransition] = useTransition();
  const focusedRef = useRef<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Sau khi làm tươi, bỏ chọn những dòng không còn trong danh sách.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [ids]);

  const toggle = useCallback((id: string) => {
    setMessage(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const describe = useCallback(
    (result: BulkResult) => {
      if (!result.ok) {
        return fill(labels.rejections[result.reason] ?? labels.rejections.unavailable ?? '', {
          max,
        });
      }
      const lines = [fill(labels.result, { done: result.done, requested: result.requested })];
      for (const [reason, count] of Object.entries(result.reasons)) {
        const template = labels.reasons[reason];
        if (template && count) lines.push(fill(template, { count }));
      }
      return lines.join(' ');
    },
    [labels, max],
  );

  const run = useCallback(
    (task: (list: string[]) => Promise<BulkResult>) => {
      if (pending || selected.size === 0) return;
      const list = ids.filter((id) => selected.has(id));
      startTransition(async () => {
        const result = await task(list);
        setMessage(describe(result));
        setConfirming(false);
        if (result.ok) {
          setSelected(new Set());
          router.refresh();
        }
      });
    },
    [pending, selected, ids, describe, router],
  );

  useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      const row = (event.target as HTMLElement | null)?.closest?.('[data-comment-id]');
      focusedRef.current = row?.getAttribute('data-comment-id') ?? focusedRef.current;
    }
    function onKeyDown(event: KeyboardEvent) {
      const action = resolveBulkShortcut(
        {
          key: event.key,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          alt: event.altKey,
          typing: isTyping(event.target),
        },
        selected.size,
      );
      if (!action) return;
      const current = focusedRef.current ? ids.indexOf(focusedRef.current) : -1;
      if (action === 'focus_next' || action === 'focus_prev') {
        const target = ids[action === 'focus_next' ? current + 1 : current - 1];
        const link = target
          ? document.querySelector<HTMLElement>(`[data-comment-id="${target}"] a`)
          : null;
        if (link) {
          event.preventDefault();
          link.focus();
        }
      } else if (action === 'toggle_focused') {
        if (focusedRef.current) {
          event.preventDefault();
          toggle(focusedRef.current);
        }
      } else if (action === 'open_hide_confirm') {
        event.preventDefault();
        setConfirming(true);
      } else if (action === 'clear') {
        event.preventDefault();
        if (confirming) setConfirming(false);
        else setSelected(new Set());
      }
    }
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [ids, selected.size, confirming, toggle]);

  // Hộp xác nhận mở → đặt tiêu điểm vào "Hủy" (mặc định an toàn: Enter không ẩn).
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const value = useMemo(() => ({ selected, toggle, labels }), [selected, toggle, labels]);
  const count = selected.size;
  return (
    <BulkContext.Provider value={value}>
      <div className="bulk-bar" role="toolbar" aria-label={labels.toolbar} data-active={count > 0}>
        {count > 0 ? (
          <>
            <span className="bulk-count">{fill(labels.selected, { count })}</span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => run((list) => skipCommentsAction(list))}
            >
              {labels.skip}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              {labels.hide}
            </button>
            <select
              className="bulk-label-select"
              aria-label={labels.labelPick}
              value={newLabel}
              disabled={pending}
              onChange={(e) => setNewLabel(e.target.value)}
            >
              <option value="">{labels.labelPick}</option>
              {labelOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.text}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending || newLabel === ''}
              onClick={() => run((list) => relabelCommentsAction(list, newLabel))}
            >
              {labels.relabel}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => setSelected(new Set())}
            >
              {labels.clear}
            </button>
            {pending ? <span aria-busy="true">{labels.working}</span> : null}
          </>
        ) : (
          <span className="bulk-hint">{labels.shortcuts}</span>
        )}
      </div>
      {confirming && count > 0 ? (
        <div className="bulk-confirm" role="alertdialog" aria-labelledby="bulk-confirm-title">
          <h3 id="bulk-confirm-title">{fill(labels.confirmTitle, { count })}</h3>
          <p>{labels.confirmBody}</p>
          <div className="bulk-confirm-actions">
            <button
              type="button"
              className="btn btn-secondary"
              ref={cancelRef}
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              {labels.confirmNo}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={() => run((list) => hideCommentsAction(list, true))}
            >
              {fill(labels.confirmYes, { count })}
            </button>
          </div>
        </div>
      ) : null}
      <p className="bulk-message" role="status" aria-live="polite">
        {message}
      </p>
      {children}
    </BulkContext.Provider>
  );
}

/** Ô tick của một dòng; dùng trong cây `BulkProvider`. */
export function BulkCheckbox({ id, name }: { id: string; name: string }) {
  const ctx = useContext(BulkContext);
  if (!ctx) return null;
  return (
    <input
      type="checkbox"
      className="bulk-check"
      checked={ctx.selected.has(id)}
      onChange={() => ctx.toggle(id)}
      aria-label={fill(ctx.labels.select, { name })}
    />
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Icon } from '../ui/icon';
import { FIELD_CLASS } from '../ui/tw-form';

const MAX_KEYWORDS = 50;
const MAX_LENGTH = 60;

/** Tách chuỗi gõ vào thành từ khóa sạch (cắt khoảng trắng, bỏ rỗng/quá dài/trùng không phân biệt hoa thường). */
export function addKeywords(current: readonly string[], typed: string): string[] {
  const next = [...current];
  const seen = new Set(next.map((k) => k.toLowerCase()));
  for (const raw of typed.split(/[\r\n,]+/)) {
    const word = raw.trim();
    if (!word || word.length > MAX_LENGTH || seen.has(word.toLowerCase())) continue;
    if (next.length >= MAX_KEYWORDS) break;
    seen.add(word.toLowerCase());
    next.push(word);
  }
  return next;
}

/**
 * Ô "Từ khóa chặn": chip có nút bỏ + ô nhập + nút "Thêm từ khóa" (Stitch automation.html). Giá trị gửi qua ô ẩn
 * `name` (mỗi dòng một từ), đúng định dạng `blockedKeywords` mà `parseAutomationForm` đã đọc. Enter trong ô nhập chỉ
 * thêm từ, không gửi form.
 */
export function KeywordChips({ name, initial }: { name: string; initial: readonly string[] }) {
  const t = useTranslations('automation.guard');
  const inputId = useId();
  const [words, setWords] = useState<string[]>([...initial]);
  const [typed, setTyped] = useState('');

  const commit = () => {
    setWords((current) => addKeywords(current, typed));
    setTyped('');
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={words.join('\n')} />
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('keywords')}
        </label>
        <input
          id={inputId}
          className={FIELD_CLASS}
          value={typed}
          placeholder={t('keywordsPlaceholder')}
          maxLength={MAX_LENGTH}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            commit();
          }}
        />
        <button
          type="button"
          className="flex shrink-0 items-center gap-0.5 font-label-sm text-label-sm font-semibold text-primary hover:text-on-primary-fixed-variant"
          onClick={commit}
        >
          <Icon name="add" size={14} />
          {t('keywordsAdd')}
        </button>
      </div>
      {words.length === 0 ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">{t('keywordsEmpty')}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5 pt-1">
          {words.map((word) => (
            <li key={word}>
              <span className="inline-flex items-center gap-1 rounded-full bg-error-container px-2.5 py-1 font-label-sm text-label-sm text-on-error-container">
                {word}
                <button
                  type="button"
                  className="hover:opacity-75"
                  aria-label={t('keywordsRemove', { word })}
                  onClick={() => setWords((current) => current.filter((w) => w !== word))}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

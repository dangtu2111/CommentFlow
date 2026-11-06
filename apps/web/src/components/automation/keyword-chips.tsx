'use client';

import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Chip } from '../ui/chip';

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
 * Ô "Từ khóa chặn": chip có nút bỏ + ô nhập + nút "Thêm từ khóa". Giá trị gửi qua ô ẩn `name` (mỗi dòng một từ),
 * đúng định dạng `blockedKeywords` mà `parseAutomationForm` đã đọc. Enter trong ô nhập chỉ thêm từ, không gửi form.
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
    <div className="keyword-chips">
      <input type="hidden" name={name} value={words.join('\n')} />
      <div className="keyword-chips-add">
        <label htmlFor={inputId} className="visually-hidden">
          {t('keywords')}
        </label>
        <input
          id={inputId}
          className="input"
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
        <button type="button" className="link-button" onClick={commit}>
          <Plus size={14} aria-hidden="true" />
          {t('keywordsAdd')}
        </button>
      </div>
      {words.length === 0 ? (
        <p className="muted">{t('keywordsEmpty')}</p>
      ) : (
        <ul className="keyword-chips-list">
          {words.map((word) => (
            <li key={word}>
              <Chip tone="danger" className="keyword-chip">
                {word}
                <button
                  type="button"
                  className="keyword-chip-remove"
                  aria-label={t('keywordsRemove', { word })}
                  onClick={() => setWords((current) => current.filter((w) => w !== word))}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

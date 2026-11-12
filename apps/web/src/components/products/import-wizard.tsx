'use client';

import {
  type ColumnTarget,
  IMPORT_FIELDS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportRowError,
} from '@flow/shared';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { runProductImportAction } from '../../app/app/(guarded)/products/import/actions';
import type { ImportActionResult } from '../../server/product-import';

const TARGETS: readonly ColumnTarget[] = [...IMPORT_FIELDS, 'attribute', 'ignore'];

type PreviewResult = Extract<ImportActionResult, { status: 'preview' }>;

/** Trình nhập Excel/CSV: chọn file → khớp cột → xem lỗi → xác nhận (FR-051). Mọi bước gửi lại file (không lưu server). */
export function ImportWizard() {
  const t = useTranslations('productImport');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportActionResult | null>(null);
  const [mapping, setMapping] = useState<ColumnTarget[]>([]);
  const [pending, startTransition] = useTransition();

  const run = (mode: 'preview' | 'commit', chosen: ColumnTarget[] | null) => {
    if (!file) return;
    const body = new FormData();
    body.set('file', file);
    body.set('mode', mode);
    if (chosen) body.set('mapping', JSON.stringify(chosen));
    startTransition(async () => {
      const next = await runProductImportAction(body);
      if (next.status === 'preview') setMapping(next.mapping);
      setResult(next);
    });
  };

  const recheck = () => run('preview', mapping);
  const confirm = () => run('commit', mapping);

  const reset = () => {
    setFile(null);
    setResult(null);
    setMapping([]);
  };

  return (
    <div className="space-y-space-md">
      <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {t('limits', { mb: IMPORT_MAX_BYTES / (1024 * 1024), rows: IMPORT_MAX_ROWS })}
        </p>
        <label htmlFor="import-file" className="font-title-md text-title-md text-on-surface">
          {t('fileLabel')}
        </label>
        <input
          id="import-file"
          type="file"
          className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest focus:shadow-md transition-all"
          accept=".xlsx,.csv"
          disabled={pending}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setResult(null);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-on-primary hover:bg-primary font-title-sm text-title-sm shadow-md transition-all disabled:opacity-60"
            disabled={pending || !file}
            onClick={() => run('preview', null)}
          >
            {pending && !result ? t('reading') : t('analyze')}
          </button>
        </div>
      </section>

      {result?.status === 'error' ? (
        <p role="alert">
          {t(`fileErrors.${result.error}`, {
            mb: IMPORT_MAX_BYTES / (1024 * 1024),
            rows: IMPORT_MAX_ROWS,
          })}
        </p>
      ) : null}

      {result?.status === 'preview' ? (
        <PreviewSection
          result={result}
          mapping={mapping}
          pending={pending}
          onMappingChange={setMapping}
          onRecheck={recheck}
          onConfirm={confirm}
        />
      ) : null}

      {result?.status === 'committed' ? (
        <section
          className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md"
          role="status"
        >
          <h2 className="font-title-md text-title-md text-on-surface">{t('doneTitle')}</h2>
          <p>
            {t('done', {
              created: result.productsCreated,
              updated: result.productsUpdated,
              vcreated: result.variantsCreated,
              vupdated: result.variantsUpdated,
            })}
          </p>
          {result.skippedRows > 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('skipped', { count: result.skippedRows })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-title-sm text-title-sm shadow-sm transition-colors"
              onClick={reset}
            >
              {t('reset')}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PreviewSection(props: {
  result: PreviewResult;
  mapping: ColumnTarget[];
  pending: boolean;
  onMappingChange: (mapping: ColumnTarget[]) => void;
  onRecheck: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('productImport');
  const { result, mapping, pending } = props;
  const headerOf = (index: number) => result.headers[index] || t('emptyHeader', { n: index + 1 });

  return (
    <>
      <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md">
        <h2 className="font-title-md text-title-md text-on-surface">{t('mappingTitle')}</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{t('mappingHelp')}</p>
        <table className="w-full text-left font-body-md text-body-md text-on-surface">
          <thead>
            <tr>
              <th scope="col">{t('columnHeader')}</th>
              <th scope="col">{t('targetHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {result.headers.map((_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cột được nhận diện bằng vị trí, không có id riêng
              <tr key={index}>
                <td>{headerOf(index)}</td>
                <td>
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest focus:shadow-md transition-all"
                    aria-label={headerOf(index)}
                    value={mapping[index] ?? 'ignore'}
                    disabled={pending}
                    onChange={(event) => {
                      const next = [...mapping];
                      next[index] = event.target.value as ColumnTarget;
                      props.onMappingChange(next);
                    }}
                  >
                    {TARGETS.map((target) => (
                      <option key={target} value={target}>
                        {t(`targets.${target}`)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.sample.length > 0 ? (
          <details>
            <summary>{t('sampleTitle')}</summary>
            <table className="w-full text-left font-body-md text-body-md text-on-surface">
              <tbody>
                {result.sample.map((row, rowIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: dòng mẫu chỉ để xem, không đổi thứ tự
                  <tr key={rowIndex}>
                    {result.headers.map((_, cellIndex) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: ô nhận diện bằng vị trí cột
                      <td key={cellIndex}>{row[cellIndex] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-title-sm text-title-sm shadow-sm transition-colors"
            disabled={pending}
            onClick={props.onRecheck}
          >
            {t('refresh')}
          </button>
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md">
        <h2 className="font-title-md text-title-md text-on-surface">{t('reviewTitle')}</h2>
        <p>
          {t('summary', {
            valid: result.validRows,
            total: result.totalRows,
            products: result.productCount,
            variants: result.variantCount,
          })}
        </p>
        {result.errorCount === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">{t('noErrors')}</p>
        ) : (
          <div role="alert">
            <p>{t('errorsTitle', { count: result.errorCount, shown: result.errors.length })}</p>
            <ul className="space-y-space-md">
              {result.errors.map((error) => (
                <li key={`${error.row}-${error.column}-${error.code}`}>
                  <RowErrorText error={error} headerOf={headerOf} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md">
        <h2 className="font-title-md text-title-md text-on-surface">{t('confirmTitle')}</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{t('confirmHelp')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-on-primary hover:bg-primary font-title-sm text-title-sm shadow-md transition-all disabled:opacity-60"
            disabled={pending || result.validRows === 0}
            onClick={props.onConfirm}
          >
            {pending ? t('importing') : t('confirm', { count: result.validRows })}
          </button>
        </div>
      </section>
    </>
  );
}

function RowErrorText({
  error,
  headerOf,
}: {
  error: ImportRowError;
  headerOf: (index: number) => string;
}) {
  const t = useTranslations('productImport');
  const message = t(`rowErrors.${error.code}`);
  return error.column === null
    ? t('errorRow', { row: error.row, message })
    : t('errorRowColumn', { row: error.row, column: headerOf(error.column), message });
}

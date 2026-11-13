'use client';

import { checkMediaSet, type MediaKind, maxBytesFor } from '@flow/storage/rules';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../ui/icon';

/**
 * Ảnh/video của bài đăng (COMPOSER-MEDIA, Q-PUB4). Tải từng file lên `/app/api/media` (thân là byte của file) kèm thanh tiến độ; file tải xong có `id` và được gửi theo biểu mẫu qua
 * `<input name="media">`. Kiểm tra phía trình duyệt chỉ để báo sớm (loại/kích thước/số lượng/không trộn ảnh với video); SERVER và DB kiểm lại bằng nội dung file.
 * Kho chưa cấu hình → khóa kèm lý do (không bản giả). Chỉ dùng bên trong `.tw`.
 */
export type ComposerMedia = {
  id: string;
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
};

type Item = {
  key: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  media?: ComposerMedia;
  error?: string;
};

/** Chờ giữa các lần tải để không chạm giới hạn 1 lần/giây của thao tác ghi. */
const RATE_LIMIT_WAIT_MS = 1200;
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';
const KIND_OF_MIME: Record<string, MediaKind> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
};
const ERRORS = new Set([
  'forbidden',
  'rate_limited',
  'not_configured',
  'length_required',
  'unsupported_type',
  'empty',
  'too_large',
  'storage_failed',
  'too_many_unattached',
  'unavailable',
  'network',
  'too_many_images',
  'too_many_videos',
  'mixed',
]);

function upload(file: File, onProgress: (ratio: number) => void): Promise<ComposerMedia> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/app/api/media');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.onload = () => {
      let body: { error?: string } & Partial<ComposerMedia> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // thân không phải JSON: coi như lỗi chung bên dưới
      }
      if (xhr.status === 201 && body.id && body.kind && body.contentType) {
        resolve(body as ComposerMedia);
      } else {
        reject(new Error(body.error ?? 'unavailable'));
      }
    };
    xhr.send(file);
  });
}

export function MediaUploader({
  enabled,
  initial,
  onBusyChange,
  onChange,
}: {
  enabled: boolean;
  initial: ComposerMedia[];
  /** Báo cho biểu mẫu biết đang tải lên (khóa nút lưu/đăng để không mất file chưa xong). */
  onBusyChange?: (busy: boolean) => void;
  /** Báo danh sách file đã tải xong (theo thứ tự) để bản xem trước hiển thị cùng bài. */
  onChange?: (media: ComposerMedia[]) => void;
}) {
  const t = useTranslations('composer');
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>(
    initial.map((media) => ({
      key: media.id,
      name: media.kind === 'video' ? t('media.video') : t('media.image'),
      status: 'done',
      progress: 1,
      media,
    })),
  );
  const busy = items.some((item) => item.status === 'uploading');
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const done = items.flatMap((item) => (item.status === 'done' && item.media ? [item.media] : []));
  const doneKey = done.map((media) => media.id).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ báo khi danh sách id thay đổi (doneKey), không theo danh tính mảng
  useEffect(() => {
    onChange?.(done);
  }, [doneKey, onChange]);

  const patch = (key: string, change: Partial<Item>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );

  const startUpload = async (file: File, key: string) => {
    try {
      // Bộ giới hạn thao tác ghi cho phép 1 lần/giây: tải lần lượt, gặp `rate_limited` thì đợi rồi thử lại (tối đa 3 lần) thay vì báo lỗi.
      let media: ComposerMedia | undefined;
      for (let attempt = 0; media === undefined; attempt += 1) {
        try {
          media = await upload(file, (ratio) => patch(key, { progress: ratio }));
        } catch (error) {
          const limited = error instanceof Error && error.message === 'rate_limited';
          if (!limited || attempt >= 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS));
        }
      }
      patch(key, { status: 'done', progress: 1, media });
    } catch (error) {
      patch(key, {
        status: 'error',
        error: error instanceof Error ? error.message : 'unavailable',
      });
    }
  };

  const onPick = async (files: FileList | null) => {
    if (!files) return;
    const kinds: MediaKind[] = done.map((media) => media.kind);
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${crypto.randomUUID()}`;
      const kind = KIND_OF_MIME[file.type];
      const setError = (error: string) =>
        setItems((current) => [
          ...current,
          { key, name: file.name, status: 'error', progress: 0, error },
        ]);
      if (!kind) {
        setError('unsupported_type');
        continue;
      }
      if (file.size > maxBytesFor(kind)) {
        setError('too_large');
        continue;
      }
      const setProblem = checkMediaSet([...kinds, kind]);
      if (setProblem) {
        setError(setProblem);
        continue;
      }
      kinds.push(kind);
      setItems((current) => [
        ...current,
        { key, name: file.name, status: 'uploading', progress: 0 },
      ]);
      await startUpload(file, key);
    }
    if (input.current) input.current.value = '';
  };

  const remove = (key: string) => setItems((current) => current.filter((item) => item.key !== key));
  const errorText = (code: string | undefined) =>
    t(`media.error.${code && ERRORS.has(code) ? code : 'unavailable'}`);

  return (
    <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
      <div className="flex items-center justify-between gap-space-sm">
        <h2 className="flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface">
          <span className="text-primary">
            <Icon name="perm_media" size={20} />
          </span>
          {t('media.title')}
        </h2>
        <label
          htmlFor={inputId}
          className={`inline-flex items-center gap-1 rounded-lg bg-surface-container-low px-space-sm py-1 font-label-md text-label-md font-semibold text-primary ${
            enabled ? 'cursor-pointer hover:bg-surface-container' : 'cursor-not-allowed opacity-60'
          }`}
          title={enabled ? undefined : t('media.notConfigured')}
        >
          <Icon name="add_photo_alternate" size={16} />
          {t('media.add')}
        </label>
        <input
          id={inputId}
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={!enabled}
          className="sr-only"
          onChange={(event) => void onPick(event.target.files)}
        />
      </div>
      {enabled ? (
        <p className="font-label-sm text-label-sm text-on-surface-variant">{t('media.rules')}</p>
      ) : (
        <p
          role="note"
          className="rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant"
        >
          {t('media.notConfigured')}
        </p>
      )}
      {items.length === 0 && enabled ? (
        <p className="rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
          {t('media.empty')}
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-space-sm sm:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.key}
            className="relative overflow-hidden rounded-lg bg-surface-container-low"
          >
            <div className="flex aspect-video items-center justify-center bg-surface-container-high">
              {item.status === 'done' && item.media ? (
                item.media.kind === 'video' ? (
                  <video
                    src={`/app/api/media/${item.media.id}`}
                    controls
                    preload="metadata"
                    className="h-full w-full object-cover"
                  >
                    <track kind="captions" />
                  </video>
                ) : (
                  // biome-ignore lint/performance/noImgElement: xem trước từ route riêng tư của ứng dụng (không qua next/image)
                  <img
                    src={`/app/api/media/${item.media.id}`}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )
              ) : item.status === 'uploading' ? (
                <progress
                  value={item.progress}
                  max={1}
                  aria-label={t('media.uploading', { name: item.name })}
                  className="w-3/4"
                />
              ) : (
                <Icon name="error" size={24} />
              )}
            </div>
            <div className="flex items-center justify-between gap-space-xs p-space-xs">
              <span
                className={`min-w-0 flex-1 truncate font-label-sm text-label-sm ${
                  item.status === 'error' ? 'text-error' : 'text-on-surface-variant'
                }`}
                role={item.status === 'error' ? 'alert' : undefined}
              >
                {item.status === 'error' ? errorText(item.error) : item.name}
              </span>
              <button
                type="button"
                onClick={() => remove(item.key)}
                disabled={item.status === 'uploading'}
                aria-label={t('media.remove', { name: item.name })}
                className="rounded p-1 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            {item.status === 'done' && item.media ? (
              <input type="hidden" name="media" value={item.media.id} />
            ) : null}
          </li>
        ))}
      </ul>
      {busy ? (
        <p role="status" className="font-label-sm text-label-sm text-on-surface-variant">
          {t('media.busy')}
        </p>
      ) : null}
    </section>
  );
}

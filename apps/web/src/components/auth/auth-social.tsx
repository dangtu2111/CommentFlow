import { getTranslations } from 'next-intl/server';
import { Icon } from '../ui/icon';

/**
 * Nút "Tiếp tục với Facebook" (thiết kế Stitch). Đăng nhập bằng Facebook CHƯA có (cần Meta OAuth thật) nên nút
 * luôn tắt (`aria-disabled`), kèm chú thích; khi làm tính năng thật thì gắn cờ + hành động ở đây. Không có nút
 * Google (chủ dự án chốt) — QTWMA1.
 */
export async function SocialLogin() {
  const t = await getTranslations('auth.social');
  return (
    <div className="flex flex-col gap-space-sm">
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-describedby="social-note"
        className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-space-sm rounded-lg bg-[#1877F2] px-space-md font-title-sm text-title-sm text-white opacity-70 shadow-sm"
      >
        <svg
          className="h-5 w-5 fill-current"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        <span>{t('facebook')}</span>
      </button>
      <p
        id="social-note"
        className="flex items-center justify-center gap-1 text-center font-label-sm text-label-sm text-primary"
      >
        <Icon name="bolt" size={13} />
        {t('unavailable')}
      </p>
      <div className="relative flex items-center justify-center pt-space-xs">
        <div className="h-px w-full bg-surface-container-high" />
        <span className="absolute bg-surface-container-lowest px-space-sm font-label-sm text-label-sm text-on-surface-variant">
          {t('orEmail')}
        </span>
      </div>
    </div>
  );
}

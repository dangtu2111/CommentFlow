import { getTranslations } from 'next-intl/server';

/**
 * Nút "Tiếp tục với Facebook" (thiết kế Stitch). Đăng nhập bằng Facebook CHƯA có (cần Meta OAuth thật) nên nút
 * luôn tắt, kèm chú thích; khi làm tính năng thật thì gắn cờ + hành động ở đây. Không có nút Google (chủ dự án chốt).
 */
export async function SocialLogin() {
  const t = await getTranslations('auth.social');
  return (
    <div className="social">
      <button
        type="button"
        className="btn btn-block btn-facebook"
        disabled
        aria-describedby="social-note"
      >
        <svg
          className="social-glyph"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="12" fill="currentColor" />
          <path
            fill="var(--color-surface)"
            d="M13.4 19v-6h2l.4-2.4h-2.4V9.2c0-.7.3-1.2 1.3-1.2h1.2V5.9c-.2 0-1-.1-1.8-.1-1.9 0-3.1 1.1-3.1 3.2v1.6H9v2.4h2v6z"
          />
        </svg>
        {t('facebook')}
      </button>
      <p id="social-note" className="social-note">
        {t('unavailable')}
      </p>
      <div className="divider">
        <span>{t('orEmail')}</span>
      </div>
    </div>
  );
}

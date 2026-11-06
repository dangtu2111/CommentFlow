import { Download, ShieldAlert, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { PrivacyNotice } from '../../lib/data-privacy';
import { PageHeader } from '../ui/page-header';
import { SectionHead } from '../ui/section-head';
import { SettingsFrame, type SettingsFrameScope } from './settings-frame';

export type PrivacyActions = {
  exportData: (formData: FormData) => Promise<void>;
  requestDeletion: (formData: FormData) => Promise<void>;
};

/**
 * Trang Dữ liệu & Quyền riêng tư (FR-094, US-071). Xuất dữ liệu + yêu cầu xóa workspace mới là giao diện/interface:
 * hành động gửi lên máy chủ nhưng dịch vụ thật chưa mở → báo "chưa mở", không đổi dữ liệu. Thời gian lưu là sự thật
 * hiện có (job retention 14 ngày, xóa trắng bình luận đã xóa, che PII).
 */
export async function PrivacyView({
  workspaceName,
  notice,
  actions,
  frame,
}: {
  frame: SettingsFrameScope;
  workspaceName: string;
  notice: PrivacyNotice | null;
  actions: PrivacyActions;
}) {
  const t = await getTranslations('settings');
  return (
    <SettingsFrame
      {...frame}
      active="privacy"
      header={<PageHeader title={t('privacy.title')} subtitle={t('privacy.subtitle')} />}
    >
      {notice ? (
        <div className="banner banner-warning" role="status">
          <div>{t(`privacy.notices.${notice}`)}</div>
        </div>
      ) : null}

      <section className="card stack" aria-labelledby="privacy-export">
        <SectionHead
          id="privacy-export"
          icon={<Download size={20} />}
          title={t('privacy.export.title')}
          description={t('privacy.export.body')}
        />
        <form action={actions.exportData}>
          <button type="submit" className="btn btn-secondary">
            {t('privacy.export.button')} · {t('soon')}
          </button>
        </form>
      </section>

      <section className="card stack" aria-labelledby="privacy-retention">
        <SectionHead
          id="privacy-retention"
          icon={<ShieldCheck size={20} />}
          title={t('privacy.retention.title')}
        />
        <ul className="privacy-list">
          <li>{t('privacy.retention.webhook')}</li>
          <li>{t('privacy.retention.deleted')}</li>
          <li>{t('privacy.retention.pii')}</li>
        </ul>
      </section>

      <section className="card stack privacy-danger" aria-labelledby="privacy-delete">
        <SectionHead
          id="privacy-delete"
          icon={<ShieldAlert size={20} />}
          title={t('privacy.delete.title')}
          description={t('privacy.delete.body')}
          end={<span className="badge badge-off">{t('privacy.delete.soon')}</span>}
        />
        <div>
          <h3 className="section-subtitle">{t('privacy.delete.stepsTitle')}</h3>
          <ol className="privacy-list">
            <li>{t('privacy.delete.step1')}</li>
            <li>{t('privacy.delete.step2')}</li>
            <li>{t('privacy.delete.step3')}</li>
          </ol>
        </div>
        <form action={actions.requestDeletion} className="stack">
          <label className="field">
            <span>{t('privacy.delete.confirmLabel', { name: workspaceName })}</span>
            <input name="confirm" type="text" autoComplete="off" required />
          </label>
          <button type="submit" className="btn btn-danger">
            {t('privacy.delete.button')}
          </button>
        </form>
      </section>
    </SettingsFrame>
  );
}

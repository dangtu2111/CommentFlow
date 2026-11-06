import type { ChannelListItem } from '@flow/db/runtime';
import { REPLY_LANGUAGES } from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import { setReplyLanguageAction } from '../../app/app/(guarded)/settings/actions';

/**
 * Thẻ "Ngôn ngữ trả lời" theo kênh (FR-120): chỉ Owner (trang quyết định hiển thị; action tự kiểm lại).
 * Mỗi kênh một form nhỏ; `auto` = AI trả lời cùng ngôn ngữ với khách.
 */
export async function ReplyLanguageCard({
  channels,
  notice,
}: {
  channels: ChannelListItem[];
  notice: 'saved' | 'not_found' | 'invalid_language' | 'unavailable' | null;
}) {
  const t = await getTranslations('settings.replyLanguage');
  return (
    <section className="card stack" aria-labelledby="reply-language-title">
      <h2 id="reply-language-title" className="section-title">
        {t('title')}
      </h2>
      <p className="muted">{t('body')}</p>
      {notice ? (
        <p role={notice === 'saved' ? 'status' : 'alert'}>{t(`notice.${notice}`)}</p>
      ) : null}
      {channels.length === 0 ? <p className="muted">{t('empty')}</p> : null}
      <ul className="member-list">
        {channels.map((channel) => (
          <li key={channel.id} className="member-item">
            <form action={setReplyLanguageAction} className="row">
              <input type="hidden" name="channelId" value={channel.id} />
              <label className="member-info" htmlFor={`reply-language-${channel.id}`}>
                <span className="member-name">{channel.name}</span>
              </label>
              <select
                id={`reply-language-${channel.id}`}
                name="language"
                defaultValue={channel.replyLanguage}
                className="input"
              >
                {REPLY_LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {t(`option.${language}`)}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">
                {t('save')}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="muted">{t('addressSoon')}</p>
    </section>
  );
}

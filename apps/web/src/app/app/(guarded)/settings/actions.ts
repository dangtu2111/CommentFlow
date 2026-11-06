'use server';

import { setChannelReplyLanguage } from '@flow/db/runtime';
import { redirect } from 'next/navigation';
import { getDb } from '../../../../server/db';
import { createReplyLanguageAction } from '../../../../server/reply-language';
import { requireAppUser } from '../../../../server/require-app-user';

const BACK = '/app/settings';

const replyLanguage = createReplyLanguageAction({
  update: (session, channelId, language) =>
    getDb().withActor(session.workspaceId, session.userId, (tx) =>
      setChannelReplyLanguage(tx, session.workspaceId, channelId, language),
    ),
  warn: (event) => console.error(JSON.stringify(event)),
});

/**
 * Owner đổi ngôn ngữ trả lời của MỘT kênh (FR-120). Workspace/người dùng lấy từ `requireAppUser` (chỉ Owner; Staff nhận
 * 404), KHÔNG từ form; id kênh và giá trị từ form được kiểm lại. Kết thúc luôn chuyển hướng về Cài đặt kèm mã
 * thông báo (`rl`).
 */
export async function setReplyLanguageAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const result = await replyLanguage(
    { workspaceId: workspace.id, userId: user.id },
    formData.get('channelId'),
    formData.get('language'),
  );
  redirect(`${BACK}?rl=${result.ok ? 'saved' : result.reason}`);
}

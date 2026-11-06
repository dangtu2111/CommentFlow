import { notFound } from 'next/navigation';
import { DevShell } from '../../../../components/dev/dev-shell';
import { MessageCenter } from '../../../../components/messages/message-center';
import {
  MESSAGES_CONVERSATIONS,
  MESSAGES_CUSTOMER,
  MESSAGES_INTENTS,
  MESSAGES_NOW,
  MESSAGES_STATS,
  MESSAGES_TAB_COUNTS,
  MESSAGES_THREAD,
} from '../../../../lib/messages-sample';

/**
 * Trang Tin nhắn (design/stitch/messages.html) với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`
 * (UI-first 06/11/2026). Chưa có kênh nhắn tin thật nên chưa có route `/app/messages` và chưa có mục "Tin nhắn" ở thanh bên.
 */
export default function DevMessagesPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <DevShell>
      <MessageCenter
        now={MESSAGES_NOW}
        activeTab="pending"
        tabCounts={MESSAGES_TAB_COUNTS}
        stats={MESSAGES_STATS}
        intents={MESSAGES_INTENTS}
        selectedIntent={MESSAGES_INTENTS[0] ?? ''}
        conversations={MESSAGES_CONVERSATIONS}
        activeId="a"
        thread={MESSAGES_THREAD}
        customer={MESSAGES_CUSTOMER}
      />
    </DevShell>
  );
}

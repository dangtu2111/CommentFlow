/**
 * Chế độ hộp soạn trả lời của panel chi tiết (FR-042, ADR 008). Thuần: nhận dữ liệu chi tiết bình luận đã đọc từ DB,
 * trả đúng một chế độ. Quyền gửi thật do hàm DB `cf.request_comment_reply` quyết định (cùng điều kiện); ở đây chỉ để
 * hiện/ẩn hộp soạn và nêu lý do.
 */
export type ReplyUiDetail = {
  status: string;
  channelStatus: string;
  lock: { holderName: string | null; heldByMe: boolean } | null;
  latestReply: {
    status: string;
    text: string;
    errorCode: string | null;
  } | null;
};

export type ReplyUi =
  | { mode: 'compose'; prefill: string }
  | { mode: 'sending'; text: string }
  | { mode: 'sent'; text: string | null }
  | { mode: 'failed'; errorCode: string | null; prefill: string; canRetry: boolean }
  | {
      mode: 'blocked';
      reason: 'locked_by_other' | 'channel_unavailable' | 'not_replyable';
      holderName?: string | null;
    };

/** Trạng thái bình luận cho phép soạn trả lời (khớp `cf.request_comment_reply`). */
const REPLYABLE = ['new', 'pending_review', 'needs_human', 'send_failed'];

export function deriveReplyUi(detail: ReplyUiDetail): ReplyUi {
  const latest = detail.latestReply;
  if (latest && (latest.status === 'queued' || latest.status === 'sending')) {
    return { mode: 'sending', text: latest.text };
  }
  if (detail.status === 'replied' || detail.status === 'auto_replied') {
    return { mode: 'sent', text: latest?.status === 'sent' ? latest.text : null };
  }
  const channelOk = detail.channelStatus === 'connected';
  if (detail.status === 'send_failed') {
    return {
      mode: 'failed',
      errorCode: latest?.status === 'failed' ? latest.errorCode : null,
      prefill: latest?.status === 'failed' ? latest.text : '',
      canRetry: channelOk && !(detail.lock && !detail.lock.heldByMe),
    };
  }
  if (detail.lock && !detail.lock.heldByMe) {
    return { mode: 'blocked', reason: 'locked_by_other', holderName: detail.lock.holderName };
  }
  if (!channelOk) return { mode: 'blocked', reason: 'channel_unavailable' };
  if (!REPLYABLE.includes(detail.status)) return { mode: 'blocked', reason: 'not_replyable' };
  return { mode: 'compose', prefill: '' };
}

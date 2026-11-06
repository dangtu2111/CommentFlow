// Tệp đính kèm của bình luận (FR-143, docs/10 `comments.attachments`): chỉ LOẠI + link + mã ngoài. Link do khách/nền tảng
// tạo → coi là dữ liệu không tin cậy: chỉ nhận https, giới hạn độ dài và số lượng (khớp CHECK ở migration 0035).

export const ATTACHMENT_TYPES = ['photo', 'video', 'sticker', 'gif'] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export type CommentAttachment = {
  type: AttachmentType;
  url?: string;
  externalId?: string;
};

export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_URL_LENGTH = 2048;
const MAX_EXTERNAL_ID_LENGTH = 200;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const clean = (value: string): string =>
  value.replaceAll('\u0000', '').replace(LONE_SURROGATE, '�');

function safeUrl(url: string | undefined): string | undefined {
  if (url === undefined || url.length > MAX_ATTACHMENT_URL_LENGTH) return undefined;
  try {
    return new URL(url).protocol === 'https:' ? clean(url) : undefined;
  } catch {
    return undefined;
  }
}

function safeExternalId(id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  const cleaned = clean(id);
  return cleaned.length > 0 && cleaned.length <= MAX_EXTERNAL_ID_LENGTH ? cleaned : undefined;
}

/** Làm sạch, bỏ trùng và cắt còn tối đa `MAX_ATTACHMENTS`; link không an toàn bị bỏ nhưng vẫn giữ loại tệp. */
export function normalizeAttachments(items: readonly CommentAttachment[]): CommentAttachment[] {
  const seen = new Set<string>();
  const result: CommentAttachment[] = [];
  for (const item of items) {
    const url = safeUrl(item.url);
    const externalId = safeExternalId(item.externalId);
    const key = JSON.stringify([item.type, url, externalId]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      type: item.type,
      ...(url === undefined ? {} : { url }),
      ...(externalId === undefined ? {} : { externalId }),
    });
    if (result.length === MAX_ATTACHMENTS) break;
  }
  return result;
}

/** Chỉ thêm trường `attachments` khi có tệp (bình luận chữ thuần giữ nguyên dạng cũ). */
export function withAttachments(items: readonly CommentAttachment[]): {
  attachments?: CommentAttachment[];
} {
  return items.length > 0 ? { attachments: [...items] } : {};
}

/** Webhook `feed` (comment) gửi link ảnh/video ở trường `photo`/`video`. */
export function webhookAttachments(value: { photo?: string; video?: string }): CommentAttachment[] {
  const items: CommentAttachment[] = [];
  if (value.photo !== undefined) items.push({ type: 'photo', url: value.photo });
  if (value.video !== undefined) items.push({ type: 'video', url: value.video });
  return normalizeAttachments(items);
}

const GRAPH_TYPES: Record<string, AttachmentType> = {
  photo: 'photo',
  video: 'video',
  video_inline: 'video',
  sticker: 'sticker',
  animated_image_share: 'gif',
  animated_image_autoplay: 'gif',
};

export type GraphAttachment = {
  type?: string | undefined;
  url?: string | undefined;
  media?: { image?: { src?: string | undefined } | undefined } | undefined;
  target?: { id?: string | undefined } | undefined;
};

/** Trường `attachment` của Graph API (bình luận). Loại không thuộc 4 loại (share, link…) → bỏ. */
export function facebookGraphAttachment(node: GraphAttachment | undefined): CommentAttachment[] {
  const type = node?.type === undefined ? undefined : GRAPH_TYPES[node.type];
  if (!node || type === undefined) return [];
  const url = node.media?.image?.src ?? node.url;
  const externalId = node.target?.id;
  return normalizeAttachments([
    {
      type,
      ...(url === undefined ? {} : { url }),
      ...(externalId === undefined ? {} : { externalId }),
    },
  ]);
}

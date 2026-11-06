import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { DECLARED_CAPABILITIES } from '../declarations';
import { isPlatformError, PlatformError, type PlatformErrorCode } from '../errors';
import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOTAL_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_TOTAL_TIMEOUT_MS,
  readBoundedText,
} from '../facebook/connector';
import { cleanText } from '../facebook/webhook';
import type {
  ChannelRef,
  NormalizedComment,
  NormalizedEvent,
  PlatformConnector,
  TokenProvider,
} from '../types';

/**
 * Connector TikTok (FR-015, docs/12 §3, Q-TT1) theo TikTok API for Business (Organic/Accounts). CHỈ đọc + trả lời bình
 * luận; KHÔNG có `setHidden` (chưa thấy API ẩn chính thức; khai báo `hide` không hỗ trợ). Quy ước như Facebook/Instagram
 * (ADR 010): một lệnh = một lần gọi mạng, không retry ngầm, không log, lỗi ra ngoài chỉ là mã (`tiktok_*`) — không
 * token/URL/nội dung khách. Tên endpoint/trường/mã lỗi viết theo tài liệu công khai, CHƯA kiểm với tài khoản thật.
 *
 * Id bình luận: API trả lời cần cả `video_id` mà interface chung chỉ truyền `commentId` → id ghép `<video_id>:<comment_id>`
 * (`tiktokCommentId`) dùng làm `externalId`/`parentExternalId` ở mọi nơi trong hệ thống.
 */

const TIKTOK_BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';
const PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_MAX_REPLY_PAGES = 5;
const DEFAULT_MAX_FEED_POSTS = 25;
const MAX_FEED_POSTS = 100;
const SIGNATURE_TOLERANCE_SECONDS = 300;
const HEX_SHA256 = /^[0-9a-f]{64}$/;
/** Id TikTok (video/bình luận) là chữ số; chặn mọi ký tự khác trước khi đưa vào truy vấn/thân. */
const TIKTOK_ID = /^[0-9]{1,30}$/;
const COMPOSITE_ID = /^([0-9]{1,30}):([0-9]{1,30})$/;
const TOKEN_EXPIRED_CODES = new Set([40104, 40105]);
const RATE_LIMIT_CODES = new Set([40100]);
const MAX_RETRY_AFTER_SECONDS = 86_400;

export const tiktokCommentId = (videoId: string, commentId: string): string =>
  `${videoId}:${commentId}`;

export type TikTokConnectorOptions = {
  tokenProvider: TokenProvider;
  /** Khóa bí mật ứng dụng TikTok: chỉ để xác minh chữ ký webhook. Nơi dựng truyền; connector không đọc `.env`. */
  clientSecret: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxPages?: number;
  maxReplyPages?: number;
  maxFeedPosts?: number;
  totalTimeoutMs?: number;
};

export interface TikTokConnector extends PlatformConnector {
  fetchReplies(
    channel: ChannelRef,
    parentCommentId: string,
    options?: { postExternalId?: string; totalTimeoutMs?: number },
  ): Promise<NormalizedComment[]>;
  fetchPostComments(
    channel: ChannelRef,
    postExternalId: string,
    options?: { since?: Date; totalTimeoutMs?: number },
  ): Promise<NormalizedComment[]>;
}

const fail = (
  code: PlatformErrorCode,
  message: string,
  retryAfterSeconds?: number,
): PlatformError =>
  new PlatformError(code, {
    message,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });

function retryAfterOf(headers: Headers): number | undefined {
  const seconds = Number(headers.get('retry-after'));
  return Number.isInteger(seconds) && seconds > 0
    ? Math.min(seconds, MAX_RETRY_AFTER_SECONDS)
    : undefined;
}

const envelopeSchema = z.object({
  code: z.number().int(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

function failure(status: number, body: unknown, headers: Headers): PlatformError {
  const envelope = envelopeSchema.safeParse(body);
  const code = envelope.success ? envelope.data.code : undefined;
  if (code !== undefined && code !== 0) {
    if (TOKEN_EXPIRED_CODES.has(code)) return fail('TOKEN_EXPIRED', `tiktok_error_${code}`);
    if (RATE_LIMIT_CODES.has(code))
      return fail('RATE_LIMIT', `tiktok_error_${code}`, retryAfterOf(headers));
  }
  if (status === 401) return fail('TOKEN_EXPIRED', 'tiktok_http_401');
  if (status === 403) return fail('PERMISSION', 'tiktok_http_403');
  if (status === 429) return fail('RATE_LIMIT', 'tiktok_http_429', retryAfterOf(headers));
  return fail('UNKNOWN', code !== undefined ? `tiktok_error_${code}` : `tiktok_http_${status}`);
}

const commentNodeSchema = z.object({
  comment_id: z.string().regex(TIKTOK_ID),
  video_id: z.string().regex(TIKTOK_ID).optional(),
  parent_comment_id: z.string().regex(TIKTOK_ID).optional(),
  user_id: z.string().min(1).optional(),
  username: z.string().optional(),
  text: z.string().optional(),
  create_time: z.number().int().nonnegative(),
  owner: z.boolean().optional(),
});
const listSchema = z.object({
  has_more: z.boolean().optional(),
  cursor: z.number().int().optional(),
});
const commentsPageSchema = listSchema.extend({ comments: z.array(z.unknown()) });
const videosPageSchema = z.object({ videos: z.array(z.unknown()) });
const videoNodeSchema = z.object({ item_id: z.string().regex(TIKTOK_ID) });
const createdSchema = z.object({ comment_id: z.string().regex(TIKTOK_ID) });

export function createTikTokConnector(options: TikTokConnectorOptions): TikTokConnector {
  const {
    tokenProvider,
    clientSecret,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxPages = DEFAULT_MAX_PAGES,
    maxReplyPages = DEFAULT_MAX_REPLY_PAGES,
    maxFeedPosts = DEFAULT_MAX_FEED_POSTS,
    totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
  } = options;
  const doFetch = options.fetch ?? fetch;
  if (!clientSecret) throw new Error('Thiếu khóa bí mật ứng dụng TikTok (clientSecret).');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS)
    throw new Error(`timeoutMs phải trong (0, ${MAX_TIMEOUT_MS}].`);
  if (!Number.isInteger(maxPages) || maxPages <= 0)
    throw new Error('maxPages phải là số nguyên dương.');
  if (!Number.isInteger(maxReplyPages) || maxReplyPages <= 0)
    throw new Error('maxReplyPages phải là số nguyên dương.');
  if (!Number.isInteger(maxFeedPosts) || maxFeedPosts <= 0 || maxFeedPosts > MAX_FEED_POSTS)
    throw new Error(`maxFeedPosts phải là số nguyên trong [1, ${MAX_FEED_POSTS}].`);
  if (
    !Number.isInteger(totalTimeoutMs) ||
    totalTimeoutMs <= 0 ||
    totalTimeoutMs > MAX_TOTAL_TIMEOUT_MS
  )
    throw new Error(`totalTimeoutMs phải trong (0, ${MAX_TOTAL_TIMEOUT_MS}].`);

  const badResponse = () => fail('UNKNOWN', 'tiktok_bad_response');

  function tiktokId(id: string): string {
    if (typeof id !== 'string' || !TIKTOK_ID.test(id)) throw fail('UNKNOWN', 'tiktok_invalid_id');
    return id;
  }

  function splitCommentId(id: string): { videoId: string; commentId: string } {
    const match = typeof id === 'string' ? COMPOSITE_ID.exec(id) : null;
    if (!match?.[1] || !match[2]) throw fail('UNKNOWN', 'tiktok_invalid_id');
    return { videoId: match[1], commentId: match[2] };
  }

  async function tokenOf(channel: ChannelRef): Promise<string> {
    try {
      return await tokenProvider.getAccessToken(channel);
    } catch (error) {
      if (isPlatformError(error)) throw error;
      throw fail('UNKNOWN', 'tiktok_token_unavailable');
    }
  }

  /** Trả `data` của phản hồi `code === 0`. Token ở header `Access-Token`, KHÔNG ở URL. */
  async function call(
    channel: ChannelRef,
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
    overall?: AbortSignal,
  ): Promise<unknown> {
    const token = await tokenOf(channel);
    const url = new URL(`${TIKTOK_BASE_URL}/${path}`);
    const init: RequestInit = {
      method,
      headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
      signal: overall
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), overall])
        : AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    };
    if (method === 'POST') {
      init.body = JSON.stringify(params);
    } else {
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    }
    let status: number;
    let headers: Headers;
    let text: string;
    try {
      const response = await doFetch(url, init);
      status = response.status;
      headers = response.headers;
      text = await readBoundedText(response);
    } catch (error) {
      if (isPlatformError(error)) throw badResponse();
      throw fail('UNKNOWN', 'tiktok_network_error');
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    const envelope = envelopeSchema.safeParse(body);
    if (status < 200 || status >= 300 || !envelope.success || envelope.data.code !== 0)
      throw failure(status, body, headers);
    return envelope.data.data;
  }

  function toNormalized(
    node: z.infer<typeof commentNodeSchema>,
    channel: ChannelRef,
    videoId: string,
    parentExternalId: string | null,
  ): NormalizedComment | null {
    // Không khẳng định được "của chính tài khoản" (thiếu `owner`) → BỎ (chống vòng lặp, nguyên tắc #5).
    if (node.owner === undefined) return null;
    // Bình luận của khách phải có `user_id` (tránh gộp khách vào một mã tác giả rỗng); video lạ → bỏ (id cha/con khớp nhau).
    if (!node.owner && !node.user_id) return null;
    if (node.video_id !== undefined && node.video_id !== videoId) return null;
    const authorName = node.username === undefined ? undefined : cleanText(node.username);
    return {
      externalId: tiktokCommentId(videoId, node.comment_id),
      postExternalId: videoId,
      parentExternalId,
      authorExternalId: node.user_id ?? '',
      ...(authorName === undefined ? {} : { authorName }),
      text: cleanText(node.text ?? ''),
      createdAt: new Date(node.create_time * 1000),
      isFromPage: node.owner || node.user_id === channel.externalId,
    };
  }

  async function readAllComments(
    channel: ChannelRef,
    path: string,
    extra: Record<string, string>,
    map: (node: z.infer<typeof commentNodeSchema>) => NormalizedComment | null,
    limits: { pages: number; totalTimeoutMs: number },
  ): Promise<NormalizedComment[]> {
    const overall = AbortSignal.timeout(Math.min(limits.totalTimeoutMs, MAX_TOTAL_TIMEOUT_MS));
    const result: NormalizedComment[] = [];
    let cursor: number | undefined;
    for (let page = 1; page <= limits.pages; page++) {
      const params: Record<string, string> = {
        business_id: tiktokBusinessId(channel),
        ...extra,
        max_count: String(PAGE_SIZE),
      };
      if (cursor !== undefined) params.cursor = String(cursor);
      const parsed = commentsPageSchema.safeParse(
        await call(channel, 'GET', path, params, overall),
      );
      if (!parsed.success) throw badResponse();
      for (const item of parsed.data.comments) {
        const node = commentNodeSchema.safeParse(item);
        if (!node.success) continue;
        const comment = map(node.data);
        if (comment) result.push(comment);
      }
      if (parsed.data.has_more !== true) return result;
      // Phải có con trỏ MỚI tiến lên, nếu không sẽ lặp vô hạn.
      if (parsed.data.cursor === undefined || parsed.data.cursor === cursor) throw badResponse();
      cursor = parsed.data.cursor;
    }
    throw fail('UNKNOWN', 'tiktok_too_many_pages');
  }

  const tiktokBusinessId = (channel: ChannelRef): string => {
    if (!channel.externalId || channel.externalId.length > 128)
      throw fail('UNKNOWN', 'tiktok_invalid_id');
    return channel.externalId;
  };

  const connector: TikTokConnector = {
    platform: 'tiktok',
    capabilities: DECLARED_CAPABILITIES.tiktok,

    /**
     * Chữ ký webhook dạng `TikTok-Signature: t=<giây>,s=<hex>`, `s` = HMAC-SHA256(clientSecret, `<t>.<thân thô>`);
     * lệch giờ > 5 phút bị từ chối (chống phát lại); so sánh thời gian hằng. Định dạng theo tài liệu webhook của TikTok
     * for Developers — cần kiểm lại khi có quyền (Q-TT1).
     */
    async verifyWebhook(req: Request): Promise<boolean> {
      const header = req.headers.get('tiktok-signature');
      if (!header) return false;
      const parts = new Map<string, string>();
      for (const piece of header.split(',')) {
        const index = piece.indexOf('=');
        if (index > 0) parts.set(piece.slice(0, index).trim(), piece.slice(index + 1).trim());
      }
      const t = parts.get('t');
      const s = parts.get('s');
      if (!t || !s || !/^[0-9]{1,12}$/.test(t) || !HEX_SHA256.test(s)) return false;
      const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
      if (skew > SIGNATURE_TOLERANCE_SECONDS) return false;
      const raw = Buffer.from(await req.clone().arrayBuffer());
      const expected = createHmac('sha256', clientSecret)
        .update(Buffer.concat([Buffer.from(`${t}.`), raw]))
        .digest();
      return timingSafeEqual(expected, Buffer.from(s, 'hex'));
    },

    /** Chưa có webhook bình luận chính thức → không chuẩn hóa gì; bình luận đến qua polling (`fetchComments`). */
    parseWebhook(_body: unknown): NormalizedEvent[] {
      return [];
    },

    /** Quét cả tài khoản: `maxFeedPosts` video mới nhất, đọc bình luận từng video (lọc `since` ở bình luận). */
    async fetchComments(channel, since) {
      const videos = videosPageSchema.safeParse(
        await call(channel, 'GET', 'business/video/list/', {
          business_id: tiktokBusinessId(channel),
          max_count: String(maxFeedPosts),
        }),
      );
      if (!videos.success) throw badResponse();
      const result: NormalizedComment[] = [];
      for (const item of videos.data.videos.slice(0, maxFeedPosts)) {
        const node = videoNodeSchema.safeParse(item);
        if (!node.success) continue;
        result.push(...(await connector.fetchPostComments(channel, node.data.item_id, { since })));
      }
      return result;
    },

    async fetchPostComments(channel, postExternalId, opts = {}) {
      const videoId = tiktokId(postExternalId);
      const since = opts.since?.getTime();
      return readAllComments(
        channel,
        'business/comment/list/',
        { video_id: videoId },
        (node) => {
          const comment = toNormalized(
            node,
            channel,
            videoId,
            node.parent_comment_id ? tiktokCommentId(videoId, node.parent_comment_id) : null,
          );
          return comment && (since === undefined || comment.createdAt.getTime() >= since)
            ? comment
            : null;
        },
        { pages: maxPages, totalTimeoutMs: opts.totalTimeoutMs ?? totalTimeoutMs },
      );
    },

    async fetchReplies(channel, parentCommentId, opts = {}) {
      const { videoId, commentId } = splitCommentId(parentCommentId);
      return readAllComments(
        channel,
        'business/comment/reply/list/',
        { video_id: videoId, comment_id: commentId },
        (node) => toNormalized(node, channel, videoId, parentCommentId),
        { pages: maxReplyPages, totalTimeoutMs: opts.totalTimeoutMs ?? totalTimeoutMs },
      );
    },

    async reply(channel, commentId, text) {
      const ids = splitCommentId(commentId);
      const body = await call(channel, 'POST', 'business/comment/reply/create/', {
        business_id: tiktokBusinessId(channel),
        video_id: ids.videoId,
        comment_id: ids.commentId,
        text,
      });
      const created = createdSchema.safeParse(body);
      // 2xx nhưng không có id: có thể ĐÃ đăng → UNKNOWN (job sẽ kiểm trước khi gửi lại).
      if (!created.success) throw badResponse();
      return { externalId: tiktokCommentId(ids.videoId, created.data.comment_id) };
    },

    mapError(error: unknown): PlatformError {
      return isPlatformError(error) ? error : fail('UNKNOWN', 'tiktok_unknown_error');
    },
  };
  return connector;
}

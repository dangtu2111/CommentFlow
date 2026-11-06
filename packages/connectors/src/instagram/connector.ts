import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { DECLARED_CAPABILITIES } from '../declarations';
import { isPlatformError, PlatformError, type PlatformErrorCode } from '../errors';
import {
  classifyGraphCode,
  DEFAULT_GRAPH_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOTAL_TIMEOUT_MS,
  GRAPH_BASE_URL,
  graphErrorSchema,
  MAX_TIMEOUT_MS,
  MAX_TOTAL_TIMEOUT_MS,
  readBoundedText,
  retryAfterOf,
} from '../facebook/connector';
import { cleanText, verifyMetaSignature } from '../facebook/webhook';
import type {
  ChannelRef,
  NormalizedComment,
  NormalizedEvent,
  PlatformConnector,
  TokenProvider,
} from '../types';
import { parseInstagramWebhook } from './webhook';

/**
 * Connector Instagram (FR-013, docs/12 §2) theo "Instagram API with Facebook Login": cùng Meta App và token Page với
 * Facebook (Q-IG1), gọi `graph.facebook.com`. Quy ước giống connector Facebook (ADR 010): một lệnh = một lần gọi mạng,
 * không retry ngầm, không log, lỗi ra ngoài chỉ là mã (`instagram_error_190`…) — không token/URL/nội dung khách.
 * `reply` không có khóa idempotent phía Meta → chống gửi trùng là việc của job `send` (kiểm bằng `fetchReplies`).
 */

const PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_MAX_REPLY_PAGES = 5;
/** Quét cả tài khoản (`fetchComments`): số media mới nhất xét mỗi lần (trần chi phí rate limit). */
const DEFAULT_MAX_FEED_POSTS = 25;
/** ID Instagram Graph: chữ số (IG user/media/comment). */
const IG_GRAPH_ID = /^[0-9]{1,30}$/;
/** Mã giới hạn tốc độ của Graph + mã riêng của Instagram Business Use Case (80002). */
const IG_RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 341]);
const COMMENT_FIELDS = 'id,text,timestamp,username,from{id,username},parent_id';

export type InstagramConnectorOptions = {
  tokenProvider: TokenProvider;
  /** ID ứng dụng Meta (cùng Meta App với Facebook). */
  appId: string;
  /** Khóa ứng dụng: ký `appsecret_proof` và xác minh webhook. Do nơi dựng truyền; connector không đọc `.env`. */
  appSecret: string;
  fetch?: typeof fetch;
  apiVersion?: string;
  timeoutMs?: number;
  maxPages?: number;
  maxReplyPages?: number;
  maxFeedPosts?: number;
  totalTimeoutMs?: number;
};

export interface InstagramConnector extends PlatformConnector {
  setHidden(channel: ChannelRef, commentId: string, hidden: boolean): Promise<void>;
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

function graphFailure(status: number, body: unknown, headers: Headers): PlatformError {
  const parsed = graphErrorSchema.safeParse(body);
  const raw = parsed.success ? parsed.data.error.code : undefined;
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    const code = IG_RATE_LIMIT_CODES.has(raw)
      ? 'RATE_LIMIT'
      : (classifyGraphCode(raw) ?? 'UNKNOWN');
    return fail(
      code,
      `instagram_error_${raw}`,
      code === 'RATE_LIMIT' ? retryAfterOf(headers) : undefined,
    );
  }
  if (status === 429) return fail('RATE_LIMIT', 'instagram_http_429', retryAfterOf(headers));
  return fail('UNKNOWN', `instagram_http_${status}`);
}

const commentNodeSchema = z.object({
  id: z.string().min(1),
  text: z.string().optional(),
  timestamp: z.string(),
  username: z.string().optional(),
  from: z.object({ id: z.string().min(1), username: z.string().optional() }).optional(),
  parent_id: z.string().min(1).optional(),
});

const pageSchema = z.object({
  data: z.array(z.unknown()),
  paging: z
    .object({
      cursors: z.object({ after: z.string().optional() }).optional(),
      next: z.string().optional(),
    })
    .optional(),
});
const mediaNodeSchema = z.object({ id: z.string().min(1) });
const successSchema = z.object({ success: z.literal(true) });
const createdSchema = z.object({ id: z.string().min(1) });

/** `2026-11-05T03:00:00+0000` → Date (Node cần `+00:00`). Không hợp lệ → null. */
function parseGraphTime(value: string): Date | null {
  const date = new Date(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNormalized(
  node: z.infer<typeof commentNodeSchema>,
  channel: ChannelRef,
  postExternalId: string,
  parentExternalId: string | null,
): NormalizedComment | null {
  const createdAt = parseGraphTime(node.timestamp);
  // Thiếu `from` → không khẳng định được có phải do chính tài khoản mình viết: BỎ (khớp webhook; chống vòng lặp, nguyên tắc #5).
  if (!createdAt || !node.from) return null;
  const authorName = node.from?.username ?? node.username;
  return {
    externalId: node.id,
    postExternalId,
    parentExternalId,
    authorExternalId: node.from?.id ?? '',
    ...(authorName === undefined ? {} : { authorName: cleanText(authorName) }),
    text: cleanText(node.text ?? ''),
    createdAt,
    // Chống vòng lặp (nguyên tắc #5). Thiếu `from` → không khẳng định được là của tài khoản mình.
    isFromPage: node.from?.id === channel.externalId,
  };
}

export function createInstagramConnector(options: InstagramConnectorOptions): InstagramConnector {
  const {
    tokenProvider,
    appId,
    appSecret,
    apiVersion = DEFAULT_GRAPH_API_VERSION,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxPages = DEFAULT_MAX_PAGES,
    maxReplyPages = DEFAULT_MAX_REPLY_PAGES,
    maxFeedPosts = DEFAULT_MAX_FEED_POSTS,
    totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
  } = options;
  const doFetch = options.fetch ?? fetch;
  if (!appSecret) throw new Error('Thiếu khóa ứng dụng Meta (appSecret).');
  if (!appId) throw new Error('Thiếu ID ứng dụng Meta (appId).');
  if (!/^v\d+\.\d+$/.test(apiVersion)) throw new Error('Phiên bản Graph API sai dạng (vd v27.0).');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS)
    throw new Error(
      `timeoutMs phải trong (0, ${MAX_TIMEOUT_MS}] — ngắn hơn thời hạn thuê 90 giây.`,
    );
  if (!Number.isInteger(maxPages) || maxPages <= 0)
    throw new Error('maxPages phải là số nguyên dương.');
  if (!Number.isInteger(maxReplyPages) || maxReplyPages <= 0)
    throw new Error('maxReplyPages phải là số nguyên dương.');
  if (!Number.isInteger(maxFeedPosts) || maxFeedPosts <= 0 || maxFeedPosts > PAGE_SIZE)
    throw new Error(`maxFeedPosts phải là số nguyên trong [1, ${PAGE_SIZE}].`);
  if (
    !Number.isInteger(totalTimeoutMs) ||
    totalTimeoutMs <= 0 ||
    totalTimeoutMs > MAX_TOTAL_TIMEOUT_MS
  )
    throw new Error(`totalTimeoutMs phải trong (0, ${MAX_TOTAL_TIMEOUT_MS}].`);

  const badResponse = () => fail('UNKNOWN', 'instagram_bad_response');

  function igId(id: string): string {
    if (typeof id !== 'string' || !IG_GRAPH_ID.test(id))
      throw fail('UNKNOWN', 'instagram_invalid_id');
    return id;
  }

  async function tokenOf(channel: ChannelRef): Promise<string> {
    try {
      return await tokenProvider.getAccessToken(channel);
    } catch (error) {
      if (isPlatformError(error)) throw error;
      throw fail('UNKNOWN', 'instagram_token_unavailable');
    }
  }

  async function call(
    channel: ChannelRef,
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
    overall?: AbortSignal,
  ): Promise<unknown> {
    const token = await tokenOf(channel);
    const all = {
      ...params,
      access_token: token,
      appsecret_proof: createHmac('sha256', appSecret).update(token).digest('hex'),
    };
    const url = new URL(`${GRAPH_BASE_URL}/${apiVersion}/${path}`);
    const init: RequestInit = {
      method,
      signal: overall
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), overall])
        : AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    };
    // Ghi: token trong THÂN POST (không nằm trong URL/log truy cập); đọc: tham số truy vấn (như tài liệu).
    if (method === 'POST') {
      init.body = new URLSearchParams(all);
    } else {
      for (const [key, value] of Object.entries(all)) url.searchParams.set(key, value);
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
      throw fail('UNKNOWN', 'instagram_network_error');
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    if (status < 200 || status >= 300) throw graphFailure(status, body, headers);
    if (graphErrorSchema.safeParse(body).success) throw graphFailure(status, body, headers);
    return body;
  }

  async function readAllComments(
    channel: ChannelRef,
    path: string,
    map: (node: z.infer<typeof commentNodeSchema>) => NormalizedComment | null,
    limits: { pages: number; totalTimeoutMs: number },
  ): Promise<NormalizedComment[]> {
    const overall = AbortSignal.timeout(Math.min(limits.totalTimeoutMs, MAX_TOTAL_TIMEOUT_MS));
    const result: NormalizedComment[] = [];
    let after: string | undefined;
    for (let page = 1; page <= limits.pages; page++) {
      const params: Record<string, string> = { fields: COMMENT_FIELDS, limit: String(PAGE_SIZE) };
      if (after !== undefined) params.after = after;
      const parsed = pageSchema.safeParse(await call(channel, 'GET', path, params, overall));
      if (!parsed.success) throw badResponse();
      for (const item of parsed.data.data) {
        const node = commentNodeSchema.safeParse(item);
        if (!node.success) continue;
        const comment = map(node.data);
        if (comment) result.push(comment);
      }
      const { next, cursors } = parsed.data.paging ?? {};
      if (next === undefined) return result;
      // Chỉ dùng con trỏ `after`, KHÔNG đi theo URL `next` (có token và do phía ngoài đưa).
      if (cursors?.after === undefined) throw badResponse();
      after = cursors.after;
    }
    throw fail('UNKNOWN', 'instagram_too_many_pages');
  }

  const connector: InstagramConnector = {
    platform: 'instagram',
    capabilities: DECLARED_CAPABILITIES.instagram,

    async verifyWebhook(req: Request): Promise<boolean> {
      const raw = Buffer.from(await req.clone().arrayBuffer());
      return verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), appSecret);
    },

    parseWebhook(body: unknown): NormalizedEvent[] {
      return parseInstagramWebhook(body);
    },

    /**
     * Quét cả tài khoản (polling bù webhook): `maxFeedPosts` media mới nhất. KHÔNG lọc media theo thời gian (media không có
     * `updated_time`, bài cũ vẫn nhận bình luận mới); lọc `since` ở bình luận. Lỗi một media → lỗi cả lần quét.
     */
    async fetchComments(channel, since) {
      const media = pageSchema.safeParse(
        await call(channel, 'GET', `${igId(channel.externalId)}/media`, {
          fields: 'id,timestamp',
          limit: String(maxFeedPosts),
        }),
      );
      if (!media.success) throw badResponse();
      const result: NormalizedComment[] = [];
      for (const item of media.data.data.slice(0, maxFeedPosts)) {
        const node = mediaNodeSchema.safeParse(item);
        if (!node.success || !IG_GRAPH_ID.test(node.data.id)) continue;
        result.push(...(await this.fetchPostComments(channel, node.data.id, { since })));
      }
      return result;
    },

    async fetchReplies(channel, parentCommentId, opts = {}) {
      const postExternalId = opts.postExternalId ?? '';
      return readAllComments(
        channel,
        `${igId(parentCommentId)}/replies`,
        (node) => toNormalized(node, channel, postExternalId, parentCommentId),
        { pages: maxReplyPages, totalTimeoutMs: opts.totalTimeoutMs ?? totalTimeoutMs },
      );
    },

    /**
     * Bình luận CẤP 1 của một media (edge `/comments` của IG không trả trả lời lồng); trả lời lồng đến qua webhook hoặc
     * `fetchReplies` theo từng bình luận cha. Lọc `since` phía mình.
     */
    async fetchPostComments(channel, postExternalId, opts = {}) {
      const since = opts.since?.getTime();
      return readAllComments(
        channel,
        `${igId(postExternalId)}/comments`,
        (node) => {
          const comment = toNormalized(node, channel, postExternalId, node.parent_id ?? null);
          return comment && (since === undefined || comment.createdAt.getTime() >= since)
            ? comment
            : null;
        },
        { pages: maxPages, totalTimeoutMs: opts.totalTimeoutMs ?? totalTimeoutMs },
      );
    },

    async reply(channel, commentId, text) {
      const body = await call(channel, 'POST', `${igId(commentId)}/replies`, { message: text });
      const created = createdSchema.safeParse(body);
      // 2xx nhưng không có id: có thể ĐÃ đăng → UNKNOWN (job sẽ kiểm trước khi gửi lại).
      if (!created.success) throw badResponse();
      return { externalId: created.data.id };
    },

    async setHidden(channel, commentId, hidden) {
      const body = await call(channel, 'POST', igId(commentId), {
        hide: hidden ? 'true' : 'false',
      });
      if (!successSchema.safeParse(body).success) throw badResponse();
    },

    mapError(error: unknown): PlatformError {
      return isPlatformError(error) ? error : fail('UNKNOWN', 'instagram_unknown_error');
    },
  };
  return connector;
}

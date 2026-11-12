import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { facebookGraphAttachment, withAttachments } from '../attachments';
import type { ConnectorCapabilities } from '../capabilities';
import { DECLARED_CAPABILITIES } from '../declarations';
import { isPlatformError, PlatformError, type PlatformErrorCode } from '../errors';
import type {
  ChannelRef,
  NormalizedComment,
  NormalizedEvent,
  PlatformConnector,
  TokenProvider,
} from '../types';
import { type FacebookTokenInfo, parseDebugToken, scopesForPage } from './debug-token';
import { cleanText, parseMetaWebhook, verifyMetaSignature } from './webhook';

/**
 * Connector Facebook Graph API (ADR 010). Chỉ dùng API chính thức; KHÔNG log; mọi lỗi ra ngoài chỉ là mã
 * (`PlatformError` không `cause`, `message` dạng `facebook_error_190`) — không token, URL, nội dung/tên khách, thông báo của Meta.
 * Không retry ngầm: một lệnh = một lần gọi mạng; chính sách thử lại là của job (outbox). `reply` không có khóa
 * idempotent phía Meta — chống gửi trùng là việc của job `send` (kiểm bằng `fetchReplies` trước khi gửi lại).
 */

export const GRAPH_BASE_URL = 'https://graph.facebook.com';
export const DEFAULT_GRAPH_API_VERSION = 'v27.0';
/** Ngắn hơn hẳn thời hạn thuê 90 giây của job `send` (ADR 008). */
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 60_000;
/**
 * Tổng thời hạn cho một thao tác NHIỀU TRANG (kiểm trước khi gửi lại / quét bài). Job `send` thuê 90 giây:
 * kiểm trước (≤ DEFAULT_TOTAL_TIMEOUT_MS) + `reply` (≤ DEFAULT_TIMEOUT_MS) = 75 giây < 90 (ADR 010 §2).
 */
export const DEFAULT_TOTAL_TIMEOUT_MS = 45_000;
export const MAX_TOTAL_TIMEOUT_MS = 45_000;
/** Giới hạn byte đọc từ một thân phản hồi; vượt → `facebook_bad_response`. */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 20;
/** Đường kiểm-trước-khi-gửi-lại: tối đa 5 trang × 100 = 500 trả lời trực tiếp; nhiều hơn → UNKNOWN (không đoán). */
const DEFAULT_MAX_REPLY_PAGES = 5;
/** Quét cả Page (`fetchComments`): số bài mới nhất xét mỗi lần (QP1). */
const DEFAULT_MAX_FEED_POSTS = 25;
/** ID Graph của Page/bài/bình luận: chữ số, tối đa 3 đoạn nối bằng "_" (vd `pageId_postId`, `postId_commentId`). */
const GRAPH_ID = /^[0-9]{1,30}(_[0-9]{1,30}){0,2}$/;
const PAGE_SIZE = 100;
const MAX_RETRY_AFTER_SECONDS = 86_400;
const COMMENT_FIELDS =
  'id,message,created_time,from{id,name},parent{id},attachment{type,url,media,target}';

export type FacebookConnectorOptions = {
  tokenProvider: TokenProvider;
  /** ID ứng dụng Meta (để nhận ra đăng ký webhook của mình trong `subscribed_apps`). */
  appId: string;
  /** Khóa ứng dụng: ký `appsecret_proof` và xác minh webhook. Do nơi dựng truyền vào; connector không đọc `.env`. */
  appSecret: string;
  /** Tiêm để test không cần mạng. Mặc định `fetch` toàn cục. */
  fetch?: typeof fetch;
  apiVersion?: string;
  timeoutMs?: number;
  /** Số trang tối đa cho `fetchPostComments`; vượt → lỗi (không trả kết quả thiếu). */
  maxPages?: number;
  /** Số trang tối đa cho `fetchReplies` (đường kiểm-trước-khi-gửi-lại); mặc định nhỏ hơn. */
  maxReplyPages?: number;
  /** Số bài mới nhất của Page được xét mỗi lần `fetchComments` (QP1; trần chi phí rate limit). */
  maxFeedPosts?: number;
  /** Tổng thời hạn cho cả vòng phân trang (mặc định và tối đa 45 giây). */
  totalTimeoutMs?: number;
};

export type PageSubscription = { subscribed: boolean; fields: string[] };

export type FacebookPostInfo = {
  message: string | null;
  permalink: string | null;
  mediaUrl: string | null;
  createdTime: Date | null;
};

export interface FacebookConnector extends PlatformConnector {
  setHidden(channel: ChannelRef, commentId: string, hidden: boolean): Promise<void>;
  fetchReplies(
    channel: ChannelRef,
    parentCommentId: string,
    options?: { postExternalId?: string; totalTimeoutMs?: number },
  ): Promise<NormalizedComment[]>;
  /** Bình luận mọi cấp của MỘT bài (`filter=stream`), lọc `since` phía mình (tài liệu không có tham số này cho edge). */
  fetchPostComments(
    channel: ChannelRef,
    postExternalId: string,
    options?: { since?: Date; totalTimeoutMs?: number },
  ): Promise<NormalizedComment[]>;
  /**
   * Nội dung MỘT bài (POST-HYDRATE): `message`, `permalink_url`, `full_picture`, `created_time`. Trường vắng/không hợp lệ → `null`
   * (bài chỉ có ảnh không có chữ…); liên kết/ảnh chỉ nhận `http(s)`. Chỉ GET.
   */
  fetchPost(channel: ChannelRef, postExternalId: string): Promise<FacebookPostInfo>;
  /**
   * Quyền ĐÃ CẤP và hiệu lực của token Page đã lưu (`GET /debug_token`, xác thực bằng token ứng dụng): `scopes` chỉ gồm quyền áp cho Page này
   * (xét `granular_scopes`). Chỉ GET; token Page nằm trong query như mọi lệnh đọc Graph (không log).
   */
  getTokenPermissions(channel: ChannelRef): Promise<FacebookTokenInfo & { pageScopes: string[] }>;
  getPageSubscription(channel: ChannelRef): Promise<PageSubscription>;
  subscribePage(channel: ChannelRef, fields?: string[]): Promise<void>;
}

/**
 * Khai báo của connector này = khai báo Facebook (docs/12 §1) trừ hai hành động CHƯA làm: nhắn riêng và Messenger
 * (GĐ5, chưa đọc tài liệu) — khai `supported:false` để khớp hợp đồng (có phương thức ⇔ khai báo hỗ trợ).
 */
const FACEBOOK_CAPABILITIES: ConnectorCapabilities = {
  ...DECLARED_CAPABILITIES.facebook,
  privateReply: {
    supported: false,
    verified: false,
    note: 'Connector Facebook chưa làm nhắn riêng (chưa đối chiếu tài liệu).',
  },
  sendMessage: {
    supported: false,
    verified: false,
    note: 'Messenger làm ở GĐ5; connector Facebook chưa có.',
  },
};

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 341]);

/** Bảng mã lỗi Graph → mã chuẩn (docs/12 §1; error-handling; rate-limiting — xem ADR 010 §3). `null` = không có mã riêng. */
export function classifyGraphCode(code: number): PlatformErrorCode | null {
  if (code === 190 || code === 102) return 'TOKEN_EXPIRED';
  if (code === 10 || (code >= 200 && code <= 299)) return 'PERMISSION';
  if (RATE_LIMIT_CODES.has(code)) return 'RATE_LIMIT';
  if (code === 368) return 'BLOCKED';
  return null;
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

/** `X-Business-Use-Case-Usage` → số giây chờ lớn nhất (`estimated_time_to_regain_access` tính bằng phút). Hỏng → undefined. */
export function retryAfterOf(headers: Headers): number | undefined {
  const raw = headers.get('x-business-use-case-usage');
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  let minutes = 0;
  for (const entries of Object.values(parsed)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const value = (entry as { estimated_time_to_regain_access?: unknown } | null)
        ?.estimated_time_to_regain_access;
      if (typeof value === 'number' && Number.isFinite(value) && value > minutes) minutes = value;
    }
  }
  return minutes > 0 ? Math.min(minutes * 60, MAX_RETRY_AFTER_SECONDS) : undefined;
}

/** Đọc thân tối đa MAX_RESPONSE_BYTES (theo byte nhận được, không tin Content-Length). Dùng chung với `oauth.ts`. */
export async function readBoundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw fail('UNKNOWN', 'facebook_bad_response');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw fail('UNKNOWN', 'facebook_bad_response');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export const graphErrorSchema = z.object({ error: z.object({ code: z.unknown().optional() }) });

export function graphFailure(status: number, body: unknown, headers: Headers): PlatformError {
  const parsed = graphErrorSchema.safeParse(body);
  const raw = parsed.success ? parsed.data.error.code : undefined;
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    const code = classifyGraphCode(raw) ?? 'UNKNOWN';
    return fail(
      code,
      `facebook_error_${raw}`,
      code === 'RATE_LIMIT' ? retryAfterOf(headers) : undefined,
    );
  }
  if (status === 429) return fail('RATE_LIMIT', 'facebook_http_429', retryAfterOf(headers));
  return fail('UNKNOWN', `facebook_http_${status}`);
}

const graphAttachmentSchema = z.object({
  type: z.string().optional(),
  url: z.string().optional(),
  media: z.object({ image: z.object({ src: z.string().optional() }).optional() }).optional(),
  target: z.object({ id: z.string().optional() }).optional(),
});

const commentNodeSchema = z.object({
  id: z.string().min(1),
  message: z.string().optional(),
  created_time: z.string(),
  from: z.object({ id: z.string().min(1), name: z.string().optional() }).optional(),
  parent: z.object({ id: z.string().min(1) }).optional(),
  attachment: graphAttachmentSchema.optional(),
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

const postNodeSchema = z.object({ id: z.string().min(1), updated_time: z.string() });

const postDetailSchema = z.object({
  message: z.string().optional(),
  permalink_url: z.string().optional(),
  full_picture: z.string().optional(),
  created_time: z.string().optional(),
});

/** Chỉ nhận địa chỉ http(s) (không `javascript:`/`data:`…); sai → null. */
function httpUrlOrNull(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

const successSchema = z.object({ success: z.literal(true) });
const createdSchema = z.object({ id: z.string().min(1) });
const subscribedAppsSchema = z.object({
  data: z.array(z.object({ id: z.string(), subscribed_fields: z.array(z.string()).optional() })),
});

/** `2026-11-05T03:00:00+0000` (Graph) → Date; Node cần dạng `+00:00`. Không hợp lệ → null. */
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
  const createdAt = parseGraphTime(node.created_time);
  if (!createdAt) return null;
  return {
    externalId: node.id,
    postExternalId,
    parentExternalId,
    authorExternalId: node.from?.id ?? '',
    ...(node.from?.name === undefined ? {} : { authorName: cleanText(node.from.name) }),
    text: cleanText(node.message ?? ''),
    ...withAttachments(facebookGraphAttachment(node.attachment)),
    createdAt,
    // Chống vòng lặp (nguyên tắc #5): do chính Page viết. Thiếu `from` → không khẳng định được là của Page.
    isFromPage: node.from?.id === channel.externalId,
  };
}

export function createFacebookConnector(options: FacebookConnectorOptions): FacebookConnector {
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

  /** Kiểm id TRƯỚC khi ghép đường dẫn/gọi mạng; sai → UNKNOWN (mã không chứa id). */
  function graphId(id: string): string {
    if (typeof id !== 'string' || !GRAPH_ID.test(id)) throw fail('UNKNOWN', 'facebook_invalid_id');
    return id;
  }

  async function tokenOf(channel: ChannelRef): Promise<string> {
    try {
      return await tokenProvider.getAccessToken(channel);
    } catch (error) {
      if (isPlatformError(error)) throw error;
      throw fail('UNKNOWN', 'facebook_token_unavailable');
    }
  }

  /** Một lệnh gọi Graph; trả JSON đã parse (hoặc `undefined` nếu thân 2xx không phải JSON). Mọi lỗi → `PlatformError`. */
  async function call(
    channel: ChannelRef,
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
    overall?: AbortSignal,
    /** Dùng token ỨNG DỤNG (`appId|appSecret`) thay token kênh — chỉ cho `debug_token`; không ký `appsecret_proof`. */
    appAccessToken?: string,
  ): Promise<unknown> {
    const token = appAccessToken ?? (await tokenOf(channel));
    const all = {
      ...params,
      access_token: token,
      ...(appAccessToken
        ? {}
        : { appsecret_proof: createHmac('sha256', appSecret).update(token).digest('hex') }),
    };
    const url = new URL(`${GRAPH_BASE_URL}/${apiVersion}/${path}`);
    const init: RequestInit = {
      method,
      signal: overall
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), overall])
        : AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    };
    // Ghi: token trong THÂN POST (không nằm trong URL/log truy cập); đọc: tham số truy vấn (tài liệu dùng cách này).
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
      if (isPlatformError(error)) throw error;
      // Mạng/timeout/hủy: ở bước ghi nghĩa là KHÔNG BIẾT đã thực hiện chưa → UNKNOWN. Bỏ lỗi gốc (có thể chứa URL/token).
      throw fail('UNKNOWN', 'facebook_network_error');
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    if (status < 200 || status >= 300) throw graphFailure(status, body, headers);
    // Graph có thể trả lỗi kèm HTTP 200 trong một số trường hợp: vẫn phân loại theo `error.code`.
    if (graphErrorSchema.safeParse(body).success) throw graphFailure(status, body, headers);
    return body;
  }

  const badResponse = () => fail('UNKNOWN', 'facebook_bad_response');

  function expectSuccess(body: unknown): void {
    if (!successSchema.safeParse(body).success) throw badResponse();
  }

  async function readAllComments(
    channel: ChannelRef,
    path: string,
    extra: Record<string, string>,
    map: (node: z.infer<typeof commentNodeSchema>) => NormalizedComment | null,
    limits: { pages: number; totalTimeoutMs: number },
  ): Promise<NormalizedComment[]> {
    // Một đồng hồ chung cho CẢ vòng phân trang (không chỉ từng trang): trang chậm nối trang chậm vẫn bị cắt.
    const overall = AbortSignal.timeout(Math.min(limits.totalTimeoutMs, MAX_TOTAL_TIMEOUT_MS));
    const result: NormalizedComment[] = [];
    let after: string | undefined;
    for (let page = 1; page <= limits.pages; page++) {
      const params: Record<string, string> = {
        ...extra,
        fields: COMMENT_FIELDS,
        limit: String(PAGE_SIZE),
      };
      if (after !== undefined) params.after = after;
      const parsed = pageSchema.safeParse(await call(channel, 'GET', path, params, overall));
      if (!parsed.success) throw badResponse();
      for (const item of parsed.data.data) {
        const node = commentNodeSchema.safeParse(item);
        if (!node.success) continue; // bản ghi lỗi/thiếu trường: bỏ, không ném nội dung
        const comment = map(node.data);
        if (comment) result.push(comment);
      }
      const { next, cursors } = parsed.data.paging ?? {};
      if (next === undefined) return result;
      // Chỉ dùng con trỏ `after`, KHÔNG đi theo URL `next` (có token trong đó, và URL do phía ngoài đưa).
      if (cursors?.after === undefined) throw badResponse();
      after = cursors.after;
    }
    // Còn trang mà hết hạn mức: trả thiếu sẽ khiến "chưa thấy câu trả lời" bị hiểu sai → lỗi.
    throw fail('UNKNOWN', 'facebook_too_many_pages');
  }

  const connector: FacebookConnector = {
    platform: 'facebook',
    capabilities: FACEBOOK_CAPABILITIES,

    async verifyWebhook(req: Request): Promise<boolean> {
      const raw = Buffer.from(await req.clone().arrayBuffer());
      return verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), appSecret);
    },

    parseWebhook(body: unknown): NormalizedEvent[] {
      return parseMetaWebhook(body);
    },

    /**
     * Quét cả Page (FR-023, QP1): đọc tối đa `maxFeedPosts` bài mới nhất của `/{page}/feed`, chỉ đọc bình luận của bài có
     * `updated_time ≥ since` (giả định cần kiểm trên Page thật: bài được cập nhật khi có bình luận mới), lọc `since` ở bình luận.
     * Lỗi của một bài làm hỏng cả lần quét (không trả thiếu mà tưởng đủ).
     */
    async fetchComments(channel, since) {
      const feed = pageSchema.safeParse(
        await call(channel, 'GET', `${graphId(channel.externalId)}/feed`, {
          fields: 'id,updated_time',
          limit: String(maxFeedPosts),
        }),
      );
      if (!feed.success) throw badResponse();
      const sinceMs = since.getTime();
      const postIds: string[] = [];
      for (const item of feed.data.data.slice(0, maxFeedPosts)) {
        const post = postNodeSchema.safeParse(item);
        if (!post.success || !GRAPH_ID.test(post.data.id)) continue;
        const updated = parseGraphTime(post.data.updated_time);
        if (updated && updated.getTime() >= sinceMs) postIds.push(post.data.id);
      }
      const result: NormalizedComment[] = [];
      for (const postId of postIds) {
        result.push(...(await this.fetchPostComments(channel, postId, { since })));
      }
      return result;
    },

    async fetchPost(channel, postExternalId) {
      const parsed = postDetailSchema.safeParse(
        await call(channel, 'GET', graphId(postExternalId), {
          fields: 'message,permalink_url,full_picture,created_time',
        }),
      );
      if (!parsed.success) throw badResponse();
      const node = parsed.data;
      const message = node.message === undefined ? '' : cleanText(node.message).trim();
      return {
        message: message === '' ? null : message,
        permalink: httpUrlOrNull(node.permalink_url),
        mediaUrl: httpUrlOrNull(node.full_picture),
        createdTime: node.created_time ? parseGraphTime(node.created_time) : null,
      };
    },

    async fetchReplies(channel, parentCommentId, opts = {}) {
      const postExternalId = opts.postExternalId ?? '';
      return readAllComments(
        channel,
        `${graphId(parentCommentId)}/comments`,
        {},
        (node) => toNormalized(node, channel, postExternalId, parentCommentId),
        { pages: maxReplyPages, totalTimeoutMs: opts.totalTimeoutMs ?? totalTimeoutMs },
      );
    },

    async fetchPostComments(channel, postExternalId, opts = {}) {
      const since = opts.since?.getTime();
      return readAllComments(
        channel,
        `${graphId(postExternalId)}/comments`,
        { filter: 'stream' },
        (node) => {
          const comment = toNormalized(node, channel, postExternalId, node.parent?.id ?? null);
          return comment && (since === undefined || comment.createdAt.getTime() >= since)
            ? comment
            : null;
        },
        { pages: maxPages, totalTimeoutMs: opts.totalTimeoutMs ?? totalTimeoutMs },
      );
    },

    async reply(channel, commentId, text) {
      const body = await call(channel, 'POST', `${graphId(commentId)}/comments`, {
        message: text,
      });
      const created = createdSchema.safeParse(body);
      // 2xx nhưng không có id: có thể ĐÃ đăng → UNKNOWN (job sẽ kiểm trước khi gửi lại).
      if (!created.success) throw badResponse();
      return { externalId: created.data.id };
    },

    async setHidden(channel, commentId, hidden) {
      expectSuccess(
        await call(channel, 'POST', graphId(commentId), {
          is_hidden: hidden ? 'true' : 'false',
        }),
      );
    },

    async getPageSubscription(channel) {
      const parsed = subscribedAppsSchema.safeParse(
        await call(channel, 'GET', `${graphId(channel.externalId)}/subscribed_apps`, {}),
      );
      if (!parsed.success) throw badResponse();
      const mine = parsed.data.data.find((app) => app.id === appId);
      return { subscribed: mine !== undefined, fields: mine?.subscribed_fields ?? [] };
    },

    async getTokenPermissions(channel) {
      graphId(channel.externalId);
      const token = await tokenOf(channel);
      const info = parseDebugToken(
        await call(
          channel,
          'GET',
          'debug_token',
          { input_token: token },
          undefined,
          `${appId}|${appSecret}`,
        ),
      );
      if (!info) throw badResponse();
      return { ...info, pageScopes: scopesForPage(info, channel.externalId) };
    },

    async checkConnection(channel) {
      const subscription = await connector.getPageSubscription(channel);
      // Quyền đã cấp: làm TỐT NHẤT CÓ THỂ. Token không còn hiệu lực → TOKEN_EXPIRED (như mọi lệnh khác); lỗi khác khi hỏi quyền chỉ bỏ phần quyền, không làm hỏng kiểm tra webhook.
      let grantedPermissions: string[] | undefined;
      try {
        const permissions = await connector.getTokenPermissions(channel);
        if (!permissions.valid) throw fail('TOKEN_EXPIRED', 'facebook_token_invalid');
        grantedPermissions = permissions.pageScopes;
      } catch (error) {
        if (isPlatformError(error) && error.code === 'TOKEN_EXPIRED') throw error;
      }
      return {
        webhookSubscribed: subscription.subscribed,
        ...(grantedPermissions ? { grantedPermissions } : {}),
      };
    },

    async subscribePage(channel, fields = ['feed']) {
      expectSuccess(
        await call(channel, 'POST', `${graphId(channel.externalId)}/subscribed_apps`, {
          subscribed_fields: fields.join(','),
        }),
      );
    },

    mapError(error: unknown): PlatformError {
      return isPlatformError(error) ? error : fail('UNKNOWN', 'facebook_unknown_error');
    },
  };
  return connector;
}

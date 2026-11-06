/**
 * Điểm vào "chạy ứng dụng" của @flow/db: chỉ truy vấn, kết nối, schema. KHÔNG có mã migration/quản trị
 * (`runMigrations`, `resetTestSchemas`) — gói nào chạy trong web hay worker dùng đường này thay vì `@flow/db`
 * để mã quản trị DB không lọt vào bundle (và để Next.js đóng gói được).
 */
export { and, asc, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
export {
  type ChannelTokenRow,
  type CreateChannelInput,
  clearChannelToken,
  createChannel,
  listChannelKeyVersions,
  readChannelToken,
  setChannelToken,
} from './channel-tokens';
export { createDb, type Database, type FlowDb } from './client';
export { markCommentDeleted } from './comment-redact';
export {
  cancelCommentHide,
  HIDE_REJECTIONS,
  HideRejectedError,
  type HideRejection,
  HideRequestFailedError,
  requestCommentHide,
} from './hides';
export {
  createAbbreviation,
  deleteAbbreviation,
  listAbbreviations,
  listSystemAbbreviations,
  loadAbbreviationEntries,
  updateAbbreviation,
  type WorkspaceAbbreviation,
} from './queries/abbreviations';
export {
  ACTION_LOG_ACTOR_TYPES,
  type ActionLogActorType,
  type ActionLogCursor,
  type ActionLogDetail,
  type ActionLogFilter,
  type ActionLogItem,
  type ActionLogPage,
  type ActionLogViewer,
  DEFAULT_ACTION_LOG_LIMIT,
  getActionLog,
  listActionLogActions,
  listActionLogs,
  MAX_ACTION_LENGTH,
  MAX_ACTION_LOG_LIMIT,
} from './queries/action-logs';
export {
  type ChannelAlert,
  type ChannelAlertStatus,
  listChannelAlerts,
} from './queries/channel-alerts';
export { type ChannelListItem, listChannels, setChannelReplyLanguage } from './queries/channels';
export { relabelComments, SKIPPABLE_STATUSES, skipComments } from './queries/comment-bulk';
export { type CommentDetail, getCommentDetail } from './queries/comment-detail';
export {
  acquireCommentLock,
  COMMENT_LOCK_TTL_SECONDS,
  type CommentLockResult,
  releaseCommentLock,
} from './queries/comment-lock';
export {
  ACTIONABLE_COMMENT_STATUSES,
  countActionableComments,
  countCommentsByTab,
  DEFAULT_INBOX_LIMIT,
  escapeLikePattern,
  INBOX_PLATFORMS,
  INBOX_TABS,
  type InboxChannel,
  type InboxCursor,
  type InboxFilter,
  type InboxItem,
  type InboxPage,
  type InboxPlatform,
  type InboxTab,
  listComments,
  listInboxChannels,
  MAX_INBOX_LIMIT,
  MAX_SEARCH_LENGTH,
} from './queries/inbox';
export {
  type DraftChunkState,
  type DraftChunkWrite,
  deleteDraftChunks,
  listDraftChunkState,
  refreshDraftChunkMeta,
  upsertDraftChunks,
  validChunkFilter,
} from './queries/kb-chunks';
export {
  createFaqItem,
  createPolicyItem,
  deleteFaqItem,
  deletePolicyItem,
  updateFaqItem,
  updatePolicyItem,
  upsertBrandVoice,
  upsertShopProfile,
} from './queries/kb-content';
export {
  type ChunkScope,
  type CreateKbVersionInput,
  createKbVersionFromChunks,
  getCurrentVersion,
  getVersionByNumber,
  isActiveOwner,
  type KbVersionRef,
  type KbVersionRow,
  listChunkSummaries,
  listKbVersions,
  lockKbPublish,
} from './queries/kb-publish';
export {
  DEFAULT_KB_SEARCH_LIMIT,
  findProductMatch,
  getProductRevs,
  type KbSearchHit,
  type KbSearchInput,
  type KbSearchLang,
  type ProductHit,
  type ProductSearchQuery,
  searchKbChunks,
  searchProducts,
  setProductNameEmbedding,
} from './queries/kb-search';
export {
  DEFAULT_POSTS_LIMIT,
  listPosts,
  MAX_POSTS_LIMIT,
  POSTS_KINDS,
  POSTS_SORTS,
  type PostListItem,
  type PostsFilter,
  type PostsKind,
  type PostsPage,
  type PostsSort,
} from './queries/posts';
export { applyProductImport, type ProductImportResult } from './queries/product-import';
export { type ActiveVariant, findActiveVariants } from './queries/products';
export { loadReadinessSource, type ReadinessSourceData } from './queries/readiness';
export {
  listRecentCommentTexts,
  SPAM_PREVIEW_MAX_ROWS,
  type SpamPreviewRow,
} from './queries/spam-preview';
export {
  listWebhookSilentChannels,
  WEBHOOK_SILENT_WINDOW_HOURS,
  type WebhookSilentChannel,
} from './queries/webhook-silent';
export {
  cancelCommentReply,
  REPLY_REJECTIONS,
  ReplyRejectedError,
  type ReplyRejection,
  ReplyRequestFailedError,
  requestCommentReply,
} from './replies';
export { purgeExpiredWebhookPayloads, WEBHOOK_PAYLOAD_RETENTION_DAYS } from './retention';
export {
  insertRetrievalLog,
  type KbGapFilter,
  listKbGaps,
  listRetrievalLogs,
  purgeExpiredRetrievalLogs,
  type RecordedKbGap,
  recordKbGap,
  setKbGapStatus,
} from './retrieval-logs';
export { type RawTimestamp, timestampFromRow } from './row-timestamp';
export { schema } from './schema';
export {
  listStuckOutbox,
  type StuckOutboxKind,
  type StuckOutboxOptions,
  type StuckRequest,
} from './stuck-outbox';
export {
  type ConsumeUsageInput,
  type ConsumeUsageResult,
  consumeUsage,
  getUsageCounter,
  type UsageCounter,
  type UsageCounterKey,
} from './usage-counters';
export {
  type RecordedWebhookEvent,
  type RecordWebhookEventInput,
  recordWebhookEvent,
} from './webhook-events';

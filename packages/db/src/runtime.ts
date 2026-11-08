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
  type ConfirmPaymentInput,
  type ConfirmPaymentResult,
  type CreatedInvoice,
  confirmInvoicePayment,
  createInvoice,
  findInvoiceByTransferCode,
  getInvoicePayment,
  type InvoiceRow,
  listInvoices,
  type ReportTransferResult,
  reportInvoiceTransfer,
  voidInvoice,
} from './invoices';
export {
  createLeadCaptureFromEnv,
  createLeadContactSink,
  type LeadCaptureConfig,
  type LeadPersist,
  persistLeadsWith,
} from './lead-sink';
export {
  createLeadVault,
  type EncryptedLeadField,
  type LeadCipherContext,
  LeadDecryptError,
  LeadKeyConfigError,
  type LeadVault,
  parseLeadHashKey,
  parseLeadKeys,
} from './lead-vault';
export {
  activatePlan,
  getPlanState,
  getSubscription,
  grantUsageAddon,
  listPlans,
  type PlanRow,
  type SubscriptionRow,
  startTrial,
} from './plans';
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
  type ApplyCouponResult,
  applyCoupon,
  type CouponListRow,
  type CouponUpdate,
  createCoupon,
  listCoupons,
  updateCoupon,
  updatePlanAsAdmin,
} from './queries/admin-billing';
export {
  type AutomationRuleRow,
  type AutomationSettingsInput,
  type AutomationSettingsRow,
  getAutomationSettings,
  getMaxAiRepliesPerCustomerPost,
  MAX_MAX_AI_REPLIES_PER_CUSTOMER_POST,
  MIN_MAX_AI_REPLIES_PER_CUSTOMER_POST,
  saveAutomationSettings,
  saveMaxAiRepliesPerCustomerPost,
} from './queries/automation-settings';
export {
  type ChannelAlert,
  type ChannelAlertStatus,
  listChannelAlerts,
} from './queries/channel-alerts';
export {
  CHANNEL_CHECK_RESULTS,
  type ChannelActivity,
  type ChannelActivityItem,
  type ChannelCheckResult,
  type ChannelListItem,
  listChannels,
  loadChannelActivity,
  setChannelReplyLanguage,
} from './queries/channels';
export { relabelComments, SKIPPABLE_STATUSES, skipComments } from './queries/comment-bulk';
export { type CommentDetail, getCommentDetail } from './queries/comment-detail';
export {
  acquireCommentLock,
  COMMENT_LOCK_TTL_SECONDS,
  type CommentLockResult,
  releaseCommentLock,
} from './queries/comment-lock';
// DEV-SEED-DEMO: dữ liệu mẫu dev dùng đúng hàm truy vấn có sẵn (không viết SQL riêng cho bản nháp/liên kết bài).
export {
  assignConversation,
  recordInboundMessage,
  recordOutboundMessage,
  setConversationAi,
  setConversationStatus,
  touchConversationLastMessage,
} from './queries/conversations';
export {
  claimDataExport,
  completeDataExport,
  type DataExportRow,
  type DataExportStatus,
  type ExpiredExport,
  expireDataExports,
  failDataExport,
  failStaleDataExports,
  listDataExports,
  type RequestExportResult,
  readAutomationSettings,
  readCommentsPage,
  readKbChunksPage,
  readLeadsPage,
  readRulesPage,
  requestDataExport,
} from './queries/data-export';
export { insertDraft, type NewDraft } from './queries/drafts';
export {
  countEmbeddingModels,
  type EmbeddingModelCounts,
} from './queries/embedding-models';
export {
  beginEmbeddingSwitch,
  type EmbeddingState,
  getEmbeddingState,
  listChunksForSwitch,
  listEmbeddingSwitchPending,
  listProductsForSwitch,
  type SwitchChunk,
  type SwitchPendingWorkspace,
  type SwitchProduct,
  switchActiveEmbedding,
  writeChunksNext,
  writeProductsNext,
} from './queries/embedding-state';
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
  type DeadLetter,
  getIntegrationErrorCounts,
  type IncidentKind,
  type IntegrationErrorCount,
  type IntegrationIncidentInput,
  listDeadLetters,
  recordIntegrationIncident,
} from './queries/integration-health';
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
  type KbBrandVoiceRow,
  type KbContentLang,
  type KbFaqRow,
  type KbOverview,
  type KbPolicyRow,
  type KbSampleProduct,
  type KbShopProfileRow,
  type KbSourceRow,
  listBrandVoices,
  listFaqItems,
  listPolicyItems,
  listShopProfiles,
  loadKbOverview,
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
  findOrCreateSyncSource,
  findSyncSource,
  KB_SYNC_PRODUCT_LIMIT,
  listProductsForSync,
  type SyncSourceKind,
  setDraftChunkTopics,
} from './queries/kb-sync';
export {
  countLeadsByStage,
  deleteLead,
  getLeadCipher,
  LEADS_PAGE_MAX,
  type LeadCipherRow,
  type LeadRow,
  type LeadSourceType,
  type ListLeadsOptions,
  listLeads,
  type PreparedLead,
  recordLeads,
  updateLead,
} from './queries/leads';
export {
  DEFAULT_HUMAN_HOLD_MINUTES,
  DEFAULT_MAX_AI_REPLIES_PER_CUSTOMER_POST,
  DEFAULT_MERGE_WINDOW_SECONDS,
  loadPipelineContext,
  type PipelineContext,
} from './queries/pipeline-context';
export {
  type ConvoOtherQuestion,
  type ConvoTurn,
  countCustomerPostReplies,
  countRepliesForCommentThread,
  loadPipelineConvo,
  type PipelineConvo,
  REPLY_CAP_WINDOW_HOURS,
} from './queries/pipeline-convo';
export {
  getMergeWindowSeconds,
  listPendingPipelineComments,
  listWorkspacesWithPendingPipelineComments,
  type MergedGroup,
  mergeCommentGroup,
  type PendingPipelineComment,
} from './queries/pipeline-merge';
export {
  type CommentFinish,
  commentHasDraft,
  extendPipelineTurnLease,
  failPipelineTurn,
  finishCommentProcessing,
  handoffCommentIfPending,
  lockCommentForPersist,
  type ManualRerunResult,
  requestManualPipelineRun,
} from './queries/pipeline-persist';
export {
  type BeginPipelineTurnResult,
  beginPipelineTurn,
  blockPipelineTurn,
  completePipelineTurn,
  DEFAULT_TURN_LEASE_SECONDS,
  isWorkspaceEmergencyStopped,
  markPipelineTurnCharged,
  releasePipelineTurn,
} from './queries/pipeline-turns';
export { createPostNote } from './queries/post-notes';
export { linkProductsToPosts } from './queries/post-products';
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
export {
  type AliasHit,
  createProductAlias,
  deleteProductAlias,
  listProductAliases,
  type ProductAliasRow,
  searchProductsByAlias,
} from './queries/product-aliases';
export { applyProductImport, type ProductImportResult } from './queries/product-import';
export {
  applyProductSourceSync,
  archiveMissingSourceProducts,
  type ExternalProductSource,
  type ProductSourceSyncResult,
} from './queries/product-source-sync';
export { type ActiveVariant, findActiveVariants } from './queries/products';
export { loadReadinessSource, type ReadinessSourceData } from './queries/readiness';
export {
  type LoadReportRowsInput,
  type LoadReportRowsResult,
  loadReportRows,
  REPORT_MAX_ROWS,
} from './queries/reports';
export {
  applyShopifyPolicies,
  type ShopifyPolicyApplyResult,
  type ShopifyPolicyInput,
  shopifyPolicyKind,
} from './queries/shopify-policies';
export {
  createSizeChartRow,
  deleteSizeChartRow,
  findSizeChartRows,
  listSizeChartRows,
  lookupSize,
  type SizeChartRow,
  type SizeChartScope,
  updateSizeChartRow,
} from './queries/size-charts';
export {
  listRecentCommentTexts,
  SPAM_PREVIEW_MAX_ROWS,
  type SpamPreviewRow,
} from './queries/spam-preview';
export {
  createSpamRule,
  deleteSpamRule,
  listSpamRules,
  SPAM_RULES_MAX_PER_WORKSPACE,
  type SpamRuleInput,
  SpamRuleLimitError,
  type SpamRuleRow,
  setSpamRuleEnabled,
} from './queries/spam-rules';
export {
  countActiveProducts,
  listTryProductNames,
  loadTryProducts,
  loadTryShopTexts,
  type TryProduct,
  type TryProductVariant,
  type TryShopText,
} from './queries/try-products';
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
export {
  compactAiUsage,
  purgeExpiredWebhookPayloads,
  purgeExpiredWorkspaceData,
  WEBHOOK_PAYLOAD_RETENTION_DAYS,
} from './retention';
export * from './retention-policy';
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
  disconnectShopifyStore,
  getShopifyStore,
  readShopifyStoreCredentials,
  recordShopifySync,
  requestShopifySync,
  type ShopifyStoreCredentials,
  type ShopifyStoreRow,
  type ShopifyStoreStatus,
  type ShopifySyncDetail,
  type ShopifySyncResult,
  type ShopifySyncSummary,
  saveShopifyStore,
} from './shopify-store';
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
export {
  type ConfirmDeletionResult,
  cancelWorkspaceDeletion,
  confirmWorkspaceDeletion,
  type DeletionRequestRow,
  type DueDeletion,
  type ExecuteDeletionResult,
  executeWorkspaceDeletion,
  getLatestDeletionRequest,
  listDueWorkspaceDeletions,
  requestWorkspaceDeletion,
} from './workspace-deletion';

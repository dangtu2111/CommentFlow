export {
  ATTACHMENT_TYPES,
  type AttachmentType,
  type CommentAttachment,
  MAX_ATTACHMENTS,
  normalizeAttachments,
} from './attachments';
export {
  type BankTransaction,
  parseCassoPayload,
  parseSepayPayload,
  verifyCassoToken,
  verifySepayAuth,
} from './bank/bank-webhook';
export {
  ACTIONS,
  type ActionCapability,
  type ActionContext,
  type ActionDecision,
  type ActionDenial,
  type ActionName,
  actionCapabilitySchema,
  type ConnectorCapabilities,
  connectorCapabilitiesSchema,
  evaluateAction,
  textLengthOf,
} from './capabilities';
export {
  type ChannelTokenProviderOptions,
  type ChannelTokenReader,
  createChannelTokenProvider,
  type StoredChannelToken,
} from './channel-token-provider';
export { checkConnectorContract } from './contract';
export { DECLARED_CAPABILITIES } from './declarations';
export {
  isPlatformError,
  PLATFORM_ERROR_CODES,
  PlatformError,
  type PlatformErrorCode,
} from './errors';
export {
  createFacebookConnector,
  DEFAULT_GRAPH_API_VERSION,
  type FacebookConnector,
  type FacebookConnectorOptions,
  type PageSubscription,
} from './facebook/connector';
export {
  createFacebookOAuthClient,
  FACEBOOK_OAUTH_SCOPES,
  type FacebookOAuthClient,
  type FacebookOAuthOptions,
  type FacebookPageGrant,
} from './facebook/oauth';
export {
  deserializeEvent,
  eventHashOf,
  parseMetaWebhook,
  serializeEvent,
  signMetaBody,
  verifyMetaSignature,
} from './facebook/webhook';
export {
  createHaravanConnector,
  HARAVAN_API_BASE,
  type HaravanCatalog,
  type HaravanConnector,
  type HaravanConnectorOptions,
  type HaravanProduct,
  type HaravanVariant,
} from './haravan/connector';
export { buildHaravanImportPlan, parseHaravanMoney } from './haravan/normalize';
export { signHaravanBody, verifyHaravanWebhook } from './haravan/webhook';
export {
  createInstagramConnector,
  type InstagramConnector,
  type InstagramConnectorOptions,
} from './instagram/connector';
export { parseInstagramWebhook } from './instagram/webhook';
export {
  createMessengerSender,
  MESSENGER_MAX_TEXT_LENGTH,
  MessageNotAllowedError,
  type MessengerSender,
  type MessengerSenderOptions,
} from './messenger/sender';
export {
  type NormalizedMessage,
  type NormalizedMessageEvent,
  parseMessengerWebhook,
} from './messenger/webhook';
export { type MessengerSendMode, messengerSendMode } from './messenger/window';
export { type ConnectorRegistry, createConnectorRegistry } from './registry';
export {
  createSapoConnector,
  type SapoCatalog,
  type SapoConnector,
  type SapoConnectorOptions,
  type SapoProduct,
  type SapoVariant,
} from './sapo/connector';
export { buildSapoImportPlan, parseSapoMoney } from './sapo/normalize';
export { signSapoBody, verifySapoWebhook } from './sapo/webhook';
export {
  createShopifyConnector,
  DEFAULT_SHOPIFY_API_VERSION,
  type ShopifyCatalog,
  type ShopifyConnector,
  type ShopifyConnectorOptions,
  type ShopifyPolicy,
  type ShopifyProduct,
  type ShopifyVariant,
} from './shopify/connector';
export { buildShopifyImportPlan, parseShopifyMoney } from './shopify/normalize';
export { signShopifyBody, verifyShopifyWebhook } from './shopify/webhook';
export {
  createTikTokConnector,
  type TikTokConnector,
  type TikTokConnectorOptions,
  tiktokCommentId,
} from './tiktok/connector';
export {
  createTokenCipher,
  type EncryptedToken,
  type ParsedTokenKeys,
  parseTokenKeys,
  TOKEN_KEY_BYTES,
  type TokenCipher,
  TokenConfigError,
  type TokenContext,
  TokenDecryptError,
  TokenKeyMissingError,
} from './token-cipher';
export { assertTokenKeysCoverVersions } from './token-startup-check';
export {
  type ChannelRef,
  type ConversationRef,
  type NormalizedComment,
  type NormalizedEvent,
  PLATFORMS,
  type Platform,
  type PlatformConnector,
  type TokenProvider,
} from './types';
export * from './url-crawler';

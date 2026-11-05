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
export { type ConnectorRegistry, createConnectorRegistry } from './registry';
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

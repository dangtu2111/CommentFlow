// API công khai của module route. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  executeRoute,
  type RouteBranches,
  type RouteOutcome,
} from './execute-route';
export {
  ROUTES,
  type RouteDecision,
  type RouteExtract,
  type RouteInput,
  type RouteKind,
  type RouteReason,
  routeQuery,
} from './route';
export { type AskTopic, classifyAsk, SQL_ASK_TOPICS } from './route-topics';
export {
  createDbVariantLookup,
  lookupVariantsForRoute,
  type RouteVariant,
  type VariantLookup,
  wantedAttrs,
} from './sql-lookup';

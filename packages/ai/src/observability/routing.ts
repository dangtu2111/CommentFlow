/**
 * Định tuyến model LiteLLM theo bước pipeline (LITELLM-LANGFUSE, FR-034).
 *
 * Mỗi bước dùng một NHÓM model (tên trong `infra/litellm/multi-provider.example.yaml`); LiteLLM tự chọn nhà cung cấp
 * trong nhóm và chuyển sang nhóm dự phòng khi lỗi. Cờ `LITELLM_MULTI_PROVIDER_ENABLED` MẶC ĐỊNH TẮT → KHÔNG có tuyến
 * (`model: null`); nơi dùng giữ model cấu hình sẵn hoặc tắt bước — KHÔNG có model giả `mock-llm` khi chạy (chủ dự án chốt 08/11). Chưa nối vào `llm-client`.
 */

export type StepRoute = { model: string; fallbacks: string[] };

export type RoutingConfig = {
  enabled: boolean;
  routes: Record<string, StepRoute>;
  defaultRoute: StepRoute;
};

export type ResolvedRoute =
  | (StepRoute & { source: 'step' | 'default' })
  | { model: null; fallbacks: []; source: 'disabled' };

export const DEFAULT_ROUTING: RoutingConfig = {
  enabled: false,
  routes: {
    classify: { model: 'cf-classify', fallbacks: ['cf-draft'] },
    rewrite: { model: 'cf-classify', fallbacks: ['cf-draft'] },
    draft: { model: 'cf-draft', fallbacks: ['cf-draft-backup'] },
    embed: { model: 'cf-embed', fallbacks: ['cf-embed-backup'] },
  },
  defaultRoute: { model: 'cf-draft', fallbacks: ['cf-draft-backup'] },
};

export function resolveStepRoute(step: string, config: RoutingConfig): ResolvedRoute {
  if (!config.enabled) return { model: null, fallbacks: [], source: 'disabled' };
  const own = Object.hasOwn(config.routes, step) ? config.routes[step] : undefined;
  if (own) return { ...own, source: 'step' };
  return { ...config.defaultRoute, source: 'default' };
}

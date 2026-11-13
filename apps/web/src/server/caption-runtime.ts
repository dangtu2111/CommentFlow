import { type CaptionDeps, createCaptionDepsFromEnv } from '@flow/ai';
import { CAPTION_FLAG } from '@flow/shared';
import { type CaptionKind, createCaptionService, type SuggestionResult } from './caption-service';
import { getDb } from './db';
import { getFlags } from './flags';

let cached: CaptionDeps | undefined;

/** Bộ soạn caption THẬT (LiteLLM). Dựng lười một lần; cờ `cf.ai.caption` là cờ DB theo workspace, đọc ở MỖI lần dùng. Không có bản giả. */
function deps(): CaptionDeps {
  cached ??= createCaptionDepsFromEnv({
    env: process.env,
    db: { withWorkspace: (workspaceId, fn) => getDb().withWorkspace(workspaceId, fn) },
    isEnabled: (workspaceId) => getFlags().isEnabled(CAPTION_FLAG, { workspaceId }),
    onMisconfigured: (message) =>
      console.error(JSON.stringify({ event: 'llm_config_invalid', message })),
  });
  return cached;
}

/** Lý do workspace chưa dùng được AI soạn caption (`null` = dùng được) — để trang tắt nút kèm thông báo. */
export const captionNotReady = (workspaceId: string) => deps().diagnose(workspaceId);

export function suggestForWorkspace(
  workspaceId: string,
  kind: CaptionKind,
  draft: string,
): Promise<SuggestionResult> {
  return createCaptionService({
    diagnose: (id) => deps().diagnose(id),
    captioner: () => deps().captioner,
    warn: (event) => console.error(JSON.stringify(event)),
  }).suggest(workspaceId, kind, draft);
}

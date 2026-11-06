# Handoff `feat-litellm-langfuse` (claude, làn c)

**Đã làm:** module `packages/ai/src/observability/` (routing, budget, config, langfuse-trace) + test (39), mẫu `infra/litellm/multi-provider.example.yaml`, biến trong `env.example`, CBCC §2v, KT-LLF, Q-LLF1, codemap, gap-matrix/MASTER. Không migration, không sửa `.gitleaks.toml`.

**File đã đọc + điều rút ra:** `pii/mask-pipe.ts` (`maskForTrace` che đệ quy, dùng sẵn); `cache/semantic-cache.ts` (mẫu cờ `=== 'true'`); `vitest.config.ts` của `@flow/ai` (ngưỡng lines 100 %, `pii/*` nhánh 95 %).

**Còn lại:** nối `resolveStepRoute` + `createTraceSink` + `recordTraceSafely` vào `llm-client.ts` (ngoài vùng làn c); khóa ảo/ngân sách theo workspace cần bảng (làn b, `AI-VIRTUALKEY`); xóa trace Langfuse theo `comment_id` (`REDACT-COPIES-MISSING`); `userId` trace hiện = `workspace_id`.

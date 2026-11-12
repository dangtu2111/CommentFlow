// Lệnh DEV: chắt lọc kiến thức thô của MỘT workspace thành FAQ/thuộc tính NHÁP (M3, KB-DISTILL), in báo cáo số liệu (không in nội dung).
//   pnpm --filter @flow/worker kb:distill -- <workspace-uuid> [--approve] [--force-first N] [--prompt distill@1|distill@2]
// Dùng role `cf_worker` (DATABASE_WORKER_URL) và LLM THẬT qua LiteLLM (LITELLM_BASE_URL/LITELLM_API_KEY + DISTILL_LLM_MODEL, chưa đặt thì DRAFT_LLM_MODEL); thiếu → lỗi rõ.
// KHÔNG kiểm cờ `cf.ai.distill` (lệnh chạy tay có chủ đích) nhưng vẫn có trần chi phí 0,20 USD và ghi `ai_usage` (bước `distill`).
// `--approve`: duyệt TOÀN BỘ nháp bằng quyền Owner — CHỈ cho workspace có tên bắt đầu bằng "[EVAL]" (bộ đo), để đo fs-m3. Shop thật: Owner duyệt ở tab "Chờ duyệt".
// `--force-first N` (1–100): chỉ xét N đoạn đầu (theo chunk_key) và BỎ QUA `distill_hash` để đo lại prompt mới trên đoạn đã chắt lọc; đoạn được đánh dấu lại như thường.
// `--prompt distill@1|distill@2`: chọn bản prompt để A/B cùng điều kiện (mặc định bản mới nhất); ghi `ai_usage.prompt_version` đúng bản.
// Staging/production: không chạy lệnh này.
import { createLlmClient, createLlmDistiller, parseDistillPromptVersion } from '@flow/ai';
import { approveDraftFaq, createDb, listDraftFaqs, loadWorkspaceNameAndOwner } from '@flow/db';
import { isAppError } from '@flow/shared';
import { loadConfig } from '../config';
import { runDistillForWorkspace } from '../jobs/kb-distill';

try {
  const args = process.argv.slice(2);
  const workspaceId = args.find((arg) => /^[0-9a-f-]{36}$/i.test(arg));
  if (!workspaceId) {
    throw new Error(
      'Cách dùng: pnpm --filter @flow/worker kb:distill -- <workspace-uuid> [--approve]',
    );
  }
  const forceIndex = args.indexOf('--force-first');
  let forceFirst: number | undefined;
  if (forceIndex !== -1) {
    const raw = args[forceIndex + 1] ?? '';
    if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) {
      throw new Error('--force-first cần một số nguyên từ 1 đến 100.');
    }
    forceFirst = Number(raw);
  }
  const promptIndex = args.indexOf('--prompt');
  const promptVersion =
    promptIndex === -1 ? undefined : parseDistillPromptVersion(args[promptIndex + 1] ?? '');
  if (promptIndex !== -1 && !promptVersion) {
    throw new Error('--prompt chỉ nhận distill@1 hoặc distill@2.');
  }
  const appEnv = (process.env.APP_ENV ?? '').trim();
  if (appEnv === 'staging' || appEnv === 'production') {
    throw new Error('Không chạy lệnh này ở staging/production.');
  }
  const baseUrl = process.env.LITELLM_BASE_URL?.trim();
  const apiKey = process.env.LITELLM_API_KEY?.trim();
  const model = (process.env.DISTILL_LLM_MODEL ?? process.env.DRAFT_LLM_MODEL)?.trim();
  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      'Thiếu cấu hình LLM: cần LITELLM_BASE_URL, LITELLM_API_KEY và DISTILL_LLM_MODEL (hoặc DRAFT_LLM_MODEL). Không có bản giả.',
    );
  }
  const config = loadConfig();
  const db = createDb({ connectionString: config.databaseUrl, max: 4 });
  try {
    const llm = createLlmClient({
      db: {
        withWorkspace: (id: string, fn: Parameters<typeof db.withJob>[1]) => db.withJob(id, fn),
      } as unknown as Parameters<typeof createLlmClient>[0]['db'],
      baseUrl,
      apiKey,
    });
    const stats = await runDistillForWorkspace({
      db,
      workspaceId,
      distiller: createLlmDistiller({ llm, model, ...(promptVersion ? { promptVersion } : {}) }),
      ...(forceFirst === undefined ? {} : { forceFirst }),
    });
    console.log(
      `Chắt lọc xong: xét ${stats.considered} đoạn, gọi LLM ${stats.called}, đạt kiểm cứng ${stats.accepted}, ghi nháp ${stats.inserted}, đầu ra hỏng ${stats.invalidOutput}, mục sai cấu trúc ${stats.malformed}.`,
    );
    console.log(
      `Prompt ${promptVersion ?? 'mặc định'}: đạt theo loại ${JSON.stringify(stats.acceptedByKind)}.`,
    );
    console.log(
      `Đề xuất thông tin shop: mục shop_field đạt ${stats.shopFieldsAccepted}, ghi ${stats.shopSuggested}.`,
    );
    console.log(
      `Bị loại: ${JSON.stringify(stats.rejected)} · chi phí ${stats.costUsd.toFixed(4)} USD`,
    );
    if (stats.stoppedByCap) console.log('Cảnh báo: chạm trần chi phí, phần còn lại để lần sau.');
    if (args.includes('--approve')) {
      const meta = await db.withJob(workspaceId, (tx) =>
        loadWorkspaceNameAndOwner(tx, workspaceId),
      );
      if (!meta.name.startsWith('[EVAL]')) {
        throw new Error('--approve chỉ dùng cho workspace "[EVAL]…" (bộ đo).');
      }
      if (!meta.ownerUserId) throw new Error('Workspace không có Owner để duyệt.');
      const owner = meta.ownerUserId;
      const drafts = await db.withActor(workspaceId, owner, (tx) => listDraftFaqs(tx, workspaceId));
      let approved = 0;
      for (const draft of drafts) {
        if (
          await db.withActor(workspaceId, owner, (tx) => approveDraftFaq(tx, workspaceId, draft.id))
        ) {
          approved += 1;
        }
      }
      console.log(`Đã duyệt ${approved}/${drafts.length} nháp (workspace đo).`);
    }
  } finally {
    await db.close();
  }
} catch (error) {
  const message = isAppError(error)
    ? `[${error.code}] ${error.message}`
    : error instanceof Error
      ? (error.message.split('\nparams:')[0] ?? error.message)
      : 'Thất bại.';
  console.error(message);
  process.exit(1);
}

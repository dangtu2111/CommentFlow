// Chạy một làn: các bước tuần tự. Mọi I/O (gh, git, agent, file) đi qua `deps` để test bằng giả lập.
import { branchCandidates, branchFor } from './branches.mjs';
import { classifyChecks, failedCheckNames, waitForChecks } from './checks.mjs';
import { modelFor } from './config.mjs';
import { decidePr, isSafeToMerge } from './decide.mjs';
import { FREEZE_MARKER, trackingMarker } from './markers.mjs';
import { extractRootCause, isRepeatedCause } from './root-cause.mjs';
import { bullets, renderTemplate } from './templates.mjs';

export const stuckMarker = (lane) => `${lane}.stuck`;
export const doneMarker = (lane) => `${lane}.done`;

function laneVars(config, laneName, branch) {
  const lane = config.lanes[laneName];
  return {
    repo: config.repo,
    base: config.baseBranch,
    lane: laneName,
    branch,
    verifyCommands: bullets(config.verifyCommands, '(chưa cấu hình verifyCommands)'),
    laneDb: lane.testDb ?? '(làn không có DB test riêng)',
    maxFixes: config.maxFixesPerPr,
  };
}

function buildTaskPrompt(config, laneName, step, branch, deps) {
  const lane = config.lanes[laneName];
  const brief =
    deps.readText(`${config.promptDir}/${step.name}.md`) ??
    '(không có file mô tả riêng; làm theo tên việc và kế hoạch trong repo)';
  const base = laneVars(config, laneName, branch);
  const migrationBlock = lane.migration ? renderTemplate(deps.template('migration'), base) : '';
  return renderTemplate(deps.template('HEAD'), {
    ...base,
    task: step.name,
    taskBrief: brief,
    migrationBlock,
  });
}

function buildFixPrompt({ config, laneName, branch, pr, kind, attempt, failed, causes, deps }) {
  const name = kind === 'conflict' ? 'conflict' : 'ci-fix';
  const vars = {
    ...laneVars(config, laneName, branch),
    pr,
    attempt,
    failedChecks: bullets(failed, '(không rõ — xem `gh pr checks`)'),
    previousCauses: bullets(causes, '(chưa có lần sửa trước)'),
  };
  return renderTemplate(deps.template(name), vars);
}

async function findPr(config, branchName, name, deps) {
  for (const candidate of branchCandidates(config.branchPrefix, name)) {
    const pr = await deps.gh.findPr(candidate);
    if (pr) return pr;
  }
  deps.logger.log(`không thấy PR cho nhánh "${branchName}" (đã thử cả biến thể '/' và '-')`);
  return null;
}

// Đưa một PR tới merge: chờ CI thật → sửa tối đa maxFixes lần → merge hoặc KẸT.
// Ghi dấu "đang theo dõi" mỗi vòng để janitor không giành PR đang có driver.
export async function driveToMerge(args) {
  const { deps, pr } = args;
  try {
    return await driveLoop(args);
  } finally {
    deps.clearMarker(trackingMarker(pr));
  }
}

async function driveLoop({ config, laneName, pr, branch, model, deps, startFixes = 0 }) {
  const { gh, logger } = deps;
  let fixes = startFixes;
  const causes = [];
  let sinceSha;
  let repeatedCause = false;
  let freezeLogged = false;
  for (;;) {
    deps.setMarker(trackingMarker(pr), new Date(deps.now()).toISOString());
    const view = await gh.prView(pr);
    const waited =
      view.state === 'OPEN' && view.mergeable !== 'CONFLICTING'
        ? await waitForChecks({
            gh,
            pr,
            ignore: config.ci.ignoreChecks,
            sinceSha,
            ci: config.ci,
            sleep: deps.sleep,
            now: deps.now,
          })
        : { status: 'pending', checks: [] };
    // Xem lại trạng thái sau khi chờ (có thể đã merge tay/xung đột mới).
    const fresh = await gh.prView(pr);
    const decision = decidePr({
      view: fresh,
      checks: waited.status,
      fixes,
      maxFixes: config.maxFixesPerPr,
      repeatedCause,
      requireChecks: config.ci.requireChecks,
      frozen: deps.hasMarker(FREEZE_MARKER),
    });
    if (decision.reason === 'merge-freeze') {
      if (!freezeLogged) logger.log(`PR #${pr}: khóa merge đang bật, chờ gỡ khóa`);
      freezeLogged = true;
    } else {
      logger.log(`PR #${pr}: ${decision.action}`, {
        checks: waited.status,
        fixes,
        kind: decision.kind,
      });
    }
    if (decision.action === 'done') {
      logger.alert('MERGED', `PR #${pr} đã merge (${branch})`);
      return { status: 'merged' };
    }
    if (decision.action === 'stuck') return { status: 'stuck', reason: decision.reason, pr };
    if (decision.action === 'merge') {
      // Kiểm lại CI ngay trước khi merge: có thể vừa có commit/check mới (đỏ hoặc lại pending).
      const recheck = classifyChecks(await gh.prChecks(pr), config.ci.ignoreChecks);
      if (!isSafeToMerge(recheck, config.ci.requireChecks)) {
        logger.log(`PR #${pr}: CI đổi trạng thái (${recheck}) ngay trước khi merge, vòng lại`);
        if (recheck === 'pending') await deps.sleep(config.ci.pollSeconds * 1000);
        continue;
      }
      const done = await gh.merge(pr, config.merge.method);
      if (!done.ok) return { status: 'stuck', reason: `merge thất bại: ${done.message}`, pr };
      logger.alert('MERGED', `PR #${pr} đã merge (${branch})`);
      return { status: 'merged' };
    }
    if (decision.action === 'wait') {
      await deps.sleep(config.ci.pollSeconds * 1000);
      continue;
    }
    // action === 'fix'
    fixes += 1;
    sinceSha = fresh.headSha;
    await deps.git.prepare({
      dir: config.lanes[laneName].dir,
      branch: fresh.headRefName ?? branch,
      base: config.baseBranch,
    });
    const prompt = buildFixPrompt({
      config,
      laneName,
      branch: fresh.headRefName ?? branch,
      pr,
      kind: decision.kind,
      attempt: fixes,
      failed: failedCheckNames(waited.checks, config.ci.ignoreChecks),
      causes,
      deps,
    });
    const result = await deps.agent.run({ dir: config.lanes[laneName].dir, model, prompt });
    if (result.code !== 0)
      return { status: 'stuck', reason: `agent sửa lỗi thoát mã ${result.code}`, pr };
    const cause = extractRootCause(result.output);
    if (cause) {
      repeatedCause = isRepeatedCause(causes, cause, config.rootCauseThreshold);
      causes.push(cause);
    }
  }
}

async function runTaskStep({ config, laneName, step, deps }) {
  const branch = branchFor(config.branchPrefix, step.name);
  const model = modelFor(config, laneName, step);
  const dir = config.lanes[laneName].dir;
  deps.logger.log(`task ${step.name} (mô hình ${model}, nhánh ${branch})`);
  await deps.git.prepare({ dir, branch, base: config.baseBranch });
  const prompt = buildTaskPrompt(config, laneName, step, branch, deps);
  const run = await deps.agent.run({ dir, model, prompt });
  if (run.code !== 0) return { status: 'stuck', reason: `agent thoát mã ${run.code}` };
  const pr = await findPr(config, branch, step.name, deps);
  if (!pr) return { status: 'stuck', reason: `không tìm thấy PR của nhánh ${branch}` };
  return driveToMerge({ config, laneName, pr: pr.number, branch, model, deps });
}

async function runFixStep({ config, laneName, step, deps }) {
  const model = modelFor(config, laneName, step);
  const view = await deps.gh.prView(step.pr);
  deps.logger.log(`fix PR #${step.pr} (nhánh ${view.headRefName})`);
  return driveToMerge({
    config,
    laneName,
    pr: step.pr,
    branch: view.headRefName,
    model,
    deps,
  });
}

async function runWaitStep({ config, step, deps }) {
  if (!config.lanes[step.lane])
    return { status: 'stuck', reason: `làn "${step.lane}" không có trong config` };
  deps.logger.log(`chờ làn ${step.lane} xong`);
  for (;;) {
    if (deps.hasMarker(doneMarker(step.lane))) return { status: 'ok' };
    if (deps.hasMarker(stuckMarker(step.lane))) {
      return { status: 'stuck', reason: `làn ${step.lane} đang KẸT, không chờ tiếp` };
    }
    await deps.sleep(config.ci.pollSeconds * 1000);
  }
}

export async function runLane({ config, laneName, steps, deps }) {
  deps.clearMarker(stuckMarker(laneName));
  deps.clearMarker(doneMarker(laneName));
  for (const step of steps) {
    let result;
    if (step.kind === 'task') result = await runTaskStep({ config, laneName, step, deps });
    else if (step.kind === 'fix') result = await runFixStep({ config, laneName, step, deps });
    else result = await runWaitStep({ config, step, deps });
    if (result.status === 'stuck') {
      deps.setMarker(stuckMarker(laneName));
      deps.logger.alert('KẸT', `${result.reason}${result.pr ? ` (PR #${result.pr})` : ''}`);
      return { status: 'stuck', reason: result.reason };
    }
  }
  deps.setMarker(doneMarker(laneName));
  deps.logger.alert('HẾT HÀNG ĐỢI', `làn ${laneName} đã làm xong ${steps.length} bước`);
  return { status: 'done' };
}

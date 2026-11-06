// Janitor: quét PR mở lâu không ai theo dõi (PR mồ côi) rồi đưa vào land; báo làn im lặng.
import { findSilentLanes, heartbeatMarker, isFresh, parseTs } from './heartbeat.mjs';
import { FREEZE_MARKER, janitorStuckMarker, trackingMarker } from './markers.mjs';
import { doneMarker, driveToMerge, stuckMarker } from './runner.mjs';

const MIN = 60_000;

export { FREEZE_MARKER };

const silentAlertedMarker = (lane) => `${lane}.silent-alerted`;

// Thuần: PR mở > minAge, không nháp, không có dấu theo dõi còn hạn, chưa KẸT ở đúng commit này.
export function selectOrphanPrs({ prs, trackingOf, stuckOf, now, minAgeMs, ttlMs }) {
  return prs.filter((pr) => {
    if (pr.isDraft) return false;
    const created = parseTs(pr.createdAt);
    if (!Number.isFinite(created) || now - created < minAgeMs) return false;
    if (isFresh(trackingOf(pr.number), now, ttlMs)) return false;
    return stuckOf(pr.number) !== pr.headRefOid;
  });
}

function alertSilentLanes({ config, deps, now }) {
  const silent = findSilentLanes({
    lanes: Object.keys(config.lanes),
    heartbeatOf: (l) => deps.readMarker(heartbeatMarker(l)),
    isFinished: (l) => deps.hasMarker(doneMarker(l)) || deps.hasMarker(stuckMarker(l)),
    now,
    silentMs: config.heartbeat.silentMinutes * MIN,
  });
  for (const s of silent) {
    // Mỗi nhịp cũ chỉ báo một lần (làn sống lại ghi nhịp mới thì được báo lại nếu im tiếp).
    if (deps.readMarker(silentAlertedMarker(s.lane)) === s.ts) continue;
    deps.setMarker(silentAlertedMarker(s.lane), s.ts);
    deps.logger.alert(
      'IM LẶNG',
      `làn ${s.lane} im ${s.silentMinutes} phút (nhịp cuối ${s.ts}) — driver có thể đã chết`,
    );
  }
  return silent;
}

// Một lượt quét. Trả {landed, stuck, frozen, silent}.
export async function runJanitorOnce({ config, deps }) {
  const now = deps.now();
  const silent = alertSilentLanes({ config, deps, now });
  const laneName = config.janitor.lane;
  const result = { landed: [], stuck: [], frozen: deps.hasMarker(FREEZE_MARKER), silent };
  if (!laneName) {
    deps.logger.log('janitor: chưa cấu hình janitor.lane — chỉ kiểm nhịp tim làn');
    return result;
  }
  if (result.frozen) {
    deps.logger.log('janitor: khóa merge đang bật — bỏ qua lượt land');
    return result;
  }
  const prs = await deps.gh.listOpenPrs();
  const orphans = selectOrphanPrs({
    prs,
    trackingOf: (n) => deps.readMarker(trackingMarker(n)),
    stuckOf: (n) => deps.readMarker(janitorStuckMarker(n)),
    now,
    minAgeMs: config.janitor.minAgeMinutes * MIN,
    ttlMs: config.janitor.trackTtlMinutes * MIN,
  });
  deps.logger.log(`janitor: ${prs.length} PR mở, ${orphans.length} mồ côi`);
  for (const pr of orphans) {
    const r = await driveToMerge({
      config,
      laneName,
      pr: pr.number,
      branch: pr.headRefName,
      model: config.lanes[laneName].model ?? config.agent.defaultModel,
      deps,
    });
    if (r.status === 'merged') result.landed.push(pr.number);
    else {
      result.stuck.push(pr.number);
      deps.setMarker(janitorStuckMarker(pr.number), pr.headRefOid);
      deps.logger.alert('KẸT', `janitor: ${r.reason} (PR #${pr.number})`);
    }
  }
  return result;
}

export async function runJanitorLoop({ config, deps, shouldStop = () => false }) {
  while (!shouldStop()) {
    try {
      await runJanitorOnce({ config, deps });
    } catch (e) {
      deps.logger.log(`janitor: lỗi lượt quét: ${e.message}`);
    }
    await deps.sleep(config.janitor.intervalMinutes * MIN);
  }
}
